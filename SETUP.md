# SETUP.md

One-time path from nothing to a working platform: infra → app → deploy. One terminal, moving between 3 cloned repos. Total time: ~30-40 minutes, most of it waiting on `terraform apply` (EKS takes 15-20 min) and ACM validation.

Every phase has a **Verify** step. Don't skip it — the failure modes further down are much harder to debug than the ones these checks catch right away.

---

## Before you start

- [ ] AWS account with admin access (or at minimum: IAM, VPC, EC2, EKS, RDS, ECR, Route53, ACM, DynamoDB, S3)
- [ ] GitHub account, with 3 empty repos created: `employee-task-app`, `employee-task-gitops`, `employee-task-infra`
- [ ] A domain you own, nameservers already pointed at Route53 (this project only looks up the hosted zone, it doesn't create one)
- [ ] *(Optional)* A Slack incoming webhook, if you want deploy notifications

Install and check: `git`, `terraform` (>= 1.6), `aws` cli, `kubectl`, `helm` (>= 3.14), `docker`, `yq`, `jq`, `node` (20). Run each `--version` and confirm you get a real version back.

```bash
aws configure
aws sts get-caller-identity     # should print your account ID, not an error

dig NS yourdomain.com +short    # must return AWS nameservers, not your registrar's
```
If DNS isn't delegated yet, wait for it before continuing — the ACM step below will hang for up to 20 minutes and time out otherwise.

```bash
aws ec2 create-key-pair --key-name employee-task-jenkins-key --query 'KeyMaterial' --output text > ~/.ssh/employee-task-jenkins-key.pem
chmod 400 ~/.ssh/employee-task-jenkins-key.pem

curl -s https://checkip.amazonaws.com     # write this down as <YOUR_IP>
```

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/rashmiranjanDevOps/employee-task-app.git
git clone https://github.com/rashmiranjanDevOps/employee-task-gitops.git
git clone https://github.com/rashmiranjanDevOps/employee-task-infra.git
```

---

## PHASE 1 — Terraform backend

```bash
cd ~/projects/employee-task-infra/terraform
../scripts/bootstrap-backend.sh us-east-1
```
Copy the bucket name it prints into `backend.hcl`:
```bash
BUCKET_NAME="<paste-the-printed-bucket-name>"
sed -i.bak "s/employee-task-tfstate-<your-account-id>/${BUCKET_NAME}/" backend.hcl
rm -f backend.hcl.bak
```

**Verify:**
```bash
aws s3 ls | grep employee-task-tfstate
aws dynamodb describe-table --table-name employee-task-tf-locks --region us-east-1 --query "Table.TableStatus"
```
Expect the bucket listed, and `"ACTIVE"`.

---

## PHASE 2 — Apply the infrastructure

```bash
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: domain_name, github_repo_subject, jenkins_admin_cidr (<YOUR_IP>/32), jenkins_ssh_key_name

terraform init -backend-config=backend.hcl
terraform apply -var-file=terraform.tfvars
```
Type `yes`. Takes ~15-20 minutes — this one apply creates the VPC, EKS cluster, RDS database, ECR repos, ACM cert, GitHub OIDC role, and the Jenkins server (which installs itself on boot).

**Verify:**
```bash
terraform output acm_certificate_arn
aws acm describe-certificate --certificate-arn "$(terraform output -raw acm_certificate_arn)" --region us-east-1 --query "Certificate.Status"
# expect "ISSUED"

aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl get nodes     # expect a Ready node

kubectl get secret employee-task-secrets -n employee-task-dev -o jsonpath='{.data}' | jq 'keys'
# expect DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, JWT_REFRESH_SECRET, JWT_SECRET
```

Keep this terminal open — you'll copy values from `terraform output` again below.

---

## PHASE 3 — Set up Jenkins

```bash
JENKINS_IP=$(terraform output -raw jenkins_public_ip)
curl -sf -o /dev/null -w "%{http_code}\n" "http://${JENKINS_IP}:8080/login"     # expect 200
```
Open `http://<JENKINS_IP>:8080` in a browser. SSH in to get the initial admin password if it's not on screen:
```bash
ssh -i ~/.ssh/employee-task-jenkins-key.pem ubuntu@${JENKINS_IP} \
  "sudo cat /var/lib/jenkins/secrets/initialAdminPassword"
```
Paste it, click "Install suggested plugins," create your admin user.

**In the Jenkins UI**, add these credentials (Manage Jenkins → Credentials → System → Global credentials → Add Credentials):

| Kind | ID | Value |
|---|---|---|
| Secret text | `ecr-registry-url` | `terraform output ecr_repository_urls` — the part before the first `/` |
| Username with password | `aws-ecr-credentials` | an AWS access key with `ecr:*` on the two repos |
| Username with password | `github-push-token` | a GitHub PAT with `contents:write` on `employee-task-app` |
| Secret text | `slack-webhook-url` | your Slack webhook URL (optional) |

---

## PHASE 4 — Sync config into employee-task-app + GitHub secrets

```bash
cd ~/projects/employee-task-infra
./scripts/sync-config.sh ../employee-task-app
```
Commits + pushes straight to `employee-task-app`, and prints 3 values.

**Verify — confirm the values actually landed:**
```bash
grep -A1 "^image:" ../employee-task-app/helm/employee-task/values.yaml
grep "certificateArn" ../employee-task-app/helm/employee-task/values.yaml
```
Neither should show an empty `""`.

**In the GitHub UI**, go to `employee-task-app` → Settings → Secrets and variables → Actions, and add exactly what the script printed:

| Type | Name |
|---|---|
| Secret | `AWS_ROLE_ARN` |
| Variable | `AWS_REGION` |
| Variable | `ECR_REGISTRY` |

Plus one more the script can't print: Secret `SLACK_WEBHOOK_URL` (optional).

---

## PHASE 5 — Install cluster add-ons

```bash
cd ~/projects/employee-task-infra
./scripts/install-cluster-addons.sh
```
Takes ~6-8 minutes. Installs the AWS Load Balancer Controller (verifies its own IRSA annotation before continuing), ArgoCD, and ArgoCD's own Ingress, and points `argocd.yourdomain.com` at it. Idempotent — safe to re-run from the top if it errors partway. Ends by printing the ArgoCD admin password — copy it.

**Verify:**
```bash
curl -sk -o /dev/null -w "%{http_code}\n" "https://argocd.yourdomain.com"   # expect 200
```

---

## PHASE 6 — Point ArgoCD at employee-task-gitops

```bash
kubectl apply -f ../employee-task-gitops/apps/dev-application.yaml
kubectl -n argocd get applications
```
You'll see `employee-task-dev` as `OutOfSync` — expected, there's no image tag yet.

---

## PHASE 7 — Trigger the first deploy

Pick ONE of these — don't enable auto-triggers on both, or they'd race to push the same commit.

**Option A — GitHub Actions:**
```bash
cd ~/projects/employee-task-app
git push origin main
```
Watch it run: GitHub → `employee-task-app` → Actions tab.

**Option B — Jenkins:**
In the Jenkins UI: New Item → Pipeline → point it at your `employee-task-app` repo, branch `main` → Build Now.

Either way, this builds, tests, scans, pushes to ECR, then commits the new image tag straight into this repo's `helm/employee-task/values.yaml` — watch for that commit to land.

---

## PHASE 8 — Point the app's DNS at its ALB

Wait for ArgoCD to sync (~3 minutes after the commit lands), then:
```bash
cd ~/projects/employee-task-infra
kubectl -n employee-task-dev get ingress employee-task-dev-ingress
```
Wait until `ADDRESS` is populated, then:
```bash
ALB_HOSTNAME=$(kubectl -n employee-task-dev get ingress employee-task-dev-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
./scripts/update-dns.sh upsert app.yourdomain.com "$ALB_HOSTNAME"
```

---

## PHASE 9 — Verify

```bash
cd ~/projects/employee-task-app
IMAGE_TAG=$(yq '.backend.image.tag' helm/employee-task/values.yaml)
./scripts/verify-deployment.sh "$IMAGE_TAG" app.yourdomain.com
```
Expect `VERIFICATION PASSED`. Then check it in a browser: `https://app.yourdomain.com`

**You're done.** ✅

---

## Day-to-day deploys

Push to `main` → CI tests, scans, builds, pushes to ECR, and commits the new tag into `helm/employee-task/values.yaml`. ArgoCD auto-syncs within a few minutes — nothing else to do.

## Tearing it all down

Reverse order — both ALBs (app + ArgoCD) have to come down before Terraform can delete the VPC.

```bash
# 1. Delete both Ingresses (deletes both ALBs)
aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl -n employee-task-dev delete ingress employee-task-dev-ingress
kubectl -n argocd delete ingress argocd-server

# Verify both ALBs are actually gone (1-2 minutes)
aws elbv2 describe-load-balancers --region us-east-1 \
  --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-employeet') || contains(LoadBalancerName, 'k8s-argocd')].LoadBalancerName"
# expect an empty list before continuing

# 2. Delete DNS records
cd ~/projects/employee-task-infra
./scripts/update-dns.sh delete app.yourdomain.com
./scripts/update-dns.sh delete argocd.yourdomain.com

# 3. Uninstall cluster add-ons
helm uninstall argocd -n argocd
kubectl delete namespace argocd
helm uninstall aws-load-balancer-controller -n kube-system

# 4. Destroy everything
cd ~/projects/employee-task-infra/terraform
terraform destroy -var-file=terraform.tfvars
```
Type `yes`. Takes ~10-15 minutes.

**Verify nothing's left running (avoid surprise charges):**
```bash
aws ec2 describe-instances --region us-east-1 --filters "Name=tag:Project,Values=employee-task" \
  --query "Reservations[].Instances[?State.Name!='terminated'].InstanceId"
aws rds describe-db-instances --region us-east-1 --query "DBInstances[?contains(DBInstanceIdentifier,'employee-task')].DBInstanceIdentifier"
```
Both should come back empty. The S3 state bucket and DynamoDB lock table are NOT deleted by `terraform destroy` (state has to survive its own destroy) — delete them by hand if you're done with the project for good:
```bash
aws s3 rb "s3://${BUCKET_NAME}" --force
aws dynamodb delete-table --table-name employee-task-tf-locks --region us-east-1
```
