# INSTALL.md

From an empty AWS account to a working, deployed application in both environments, across all 3 repos. Do these in order — each step depends on the one before it, and each step ends with a command to confirm it actually worked before you move on. If a verification command fails, stop and fix it there — the errors get harder to diagnose the further downstream you go.

## 0. Prerequisites

- AWS account with admin access, and the AWS CLI configured (`aws sts get-caller-identity` works)
- The domain `rashmidevops.xyz` (already registered at GoDaddy, nameservers already pointed at Route53)
- An EC2 key pair already created in your target region (for Ansible to reach the Jenkins server over SSH)
- Installed locally: `terraform` (>= 1.6), `ansible`, `kubectl`, `helm` (>= 3.14), `docker`, `git`, `yq`, `jq`
- All 3 repos cloned as sibling directories: `employee-task-app`, `employee-task-gitops`, `employee-task-infra`

**Verify DNS delegation is actually live before going further** — this is the single most common source of a confusing, slow failure later (ACM certificate validation timing out in step 2):
```bash
dig NS rashmidevops.xyz +short
```
This must return AWS nameservers (`ns-....awsdns-....org`, etc.), not GoDaddy's. If it doesn't yet, wait for propagation and re-check before continuing — proceeding anyway just means discovering this 15-20 minutes into step 2 instead of now.

## 1. Bootstrap the Terraform backend

```bash
cd employee-task-infra/terraform
../scripts/bootstrap-backend.sh us-east-1
```

Creates one S3 bucket (versioned, encrypted, private) and one DynamoDB table, shared by `terraform/global` and both environments. The script prints the exact bucket name — put it in all three `backend.hcl` files:

```bash
sed -i '' 's/employee-task-tfstate-REPLACE_ME/<bucket-name-from-script-output>/' \
  global/backend.hcl environments/dev/backend.hcl environments/prod/backend.hcl
```

**Verify:**
```bash
aws s3 ls | grep employee-task-tfstate
aws dynamodb describe-table --table-name employee-task-tf-locks --region us-east-1 --query "Table.TableStatus"
```
Expect the bucket listed, and `"ACTIVE"`.

## 2. Apply global resources (once)

```bash
cd global
terraform init -backend-config=backend.hcl
terraform apply \
  -var="jenkins_admin_cidr=<your-ip>/32" \
  -var="jenkins_ssh_key_name=<your-ec2-key-pair-name>"
```

Creates the ECR repos, looks up the existing `rashmidevops.xyz` Route53 zone, creates the ACM certificate, the GitHub Actions OIDC role, and the Jenkins EC2 instance (bare — nothing installed on it yet, that's step 3).

**Verify:**
```bash
terraform output acm_certificate_arn
aws acm describe-certificate --certificate-arn "$(terraform output -raw acm_certificate_arn)" --region us-east-1 --query "Certificate.Status"
```
Expect `"ISSUED"`. If it's still `"PENDING_VALIDATION"` after `terraform apply` already finished, something's wrong with DNS delegation — go back to the prerequisites check.

## 3. Configure Jenkins with Ansible

```bash
cd ../../ansible
JENKINS_IP=$(terraform -chdir=../terraform/global output -raw jenkins_public_ip)
cp inventory.ini.example inventory.ini
# edit inventory.ini: set the IP to $JENKINS_IP and the key path to your EC2 key pair's .pem file

ansible-playbook jenkins.yml
```

Installs Jenkins, Docker, and every CLI tool the Jenkinsfile needs directly on the host. Prints the Jenkins initial admin password at the end.

**Verify:**
```bash
curl -sf -o /dev/null -w "%{http_code}\n" "http://${JENKINS_IP}:8080/login"
```
Expect `200`. Then in a browser, finish the setup wizard at `http://<JENKINS_IP>:8080`, and add 3 credentials (Manage Jenkins → Credentials):
- `aws-ecr-credentials` — an AWS access key with push access to the ECR repos
- `gitops-deploy-key` — an SSH private key added as a deploy key (write access) on `employee-task-gitops`
- `slack-webhook-url` — secret text, optional

And one variable: `ecr-registry-url`, set to the registry from `terraform output ecr_repository_urls` (in `terraform/global`).

## 4. Sync config

```bash
cd ../../employee-task-app   # repo root
../employee-task-infra/scripts/sync-config.sh ../employee-task-gitops
```

Reads `employee-task-infra/terraform/global`'s outputs and writes the ECR registry + ACM cert ARN into **both** `employee-task-gitops/environments/dev/values.yaml` and `environments/prod/values.yaml`, commits, and pushes. Prints 5 values to paste into **this repo's** GitHub Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | printed by the script |
| Variable | `AWS_REGION` | printed by the script |
| Variable | `ECR_REGISTRY` | printed by the script |
| Variable | `GITOPS_REPO` | printed by the script |
| Variable | `APP_DOMAIN` | printed by the script |
| Secret | `GITOPS_PAT` | a fine-grained PAT you create, `contents: write` on `employee-task-gitops` only |
| Secret | `SLACK_WEBHOOK_URL` | optional |

**Verify — confirm the values actually landed, don't just trust the script ran:**
```bash
grep -A1 "^image:" ../employee-task-gitops/environments/dev/values.yaml
grep "certificateArn" ../employee-task-gitops/environments/dev/values.yaml
```
Neither should show an empty `""` anymore. If either is still empty, the app's own Ingress will fail to get an ALB — it degrades to HTTP-only rather than hard-failing (see [ARCHITECTURE.md](./ARCHITECTURE.md)), but you still want these actually set before deploying for real.

## 5. Apply an environment (dev first)

```bash
cd ../employee-task-infra/terraform/environments/dev
terraform init -backend-config=backend.hcl
terraform apply -var-file=terraform.tfvars
```

Creates the VPC, EKS cluster, RDS instance, and the Kubernetes namespace + Secret the app reads its DB/JWT credentials from. Takes ~15-20 minutes.

**Verify:**
```bash
aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl get nodes
kubectl get secret employee-task-secrets -n employee-task-dev -o jsonpath='{.data}' | jq 'keys'
```
Expect at least one node `Ready`, and the secret keys: `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USER`, `JWT_REFRESH_SECRET`, `JWT_SECRET`.

## 6. Install cluster add-ons

```bash
cd ../../..   # employee-task-infra root
./scripts/install-cluster-addons.sh dev
```

One script, five phases, each with its own built-in check before moving to the next (it will stop and print a clear error rather than continuing on a broken foundation):

1. Points `kubectl` at the new cluster and confirms it can actually reach it
2. Installs the AWS Load Balancer Controller, with its ServiceAccount correctly annotated to assume the IRSA role Terraform created — and verifies the annotation actually landed, not just that the Helm install exited 0
3. Installs ArgoCD
4. Applies ArgoCD's own Ingress (from a template, with the real ACM cert ARN substituted in fresh from `terraform output`) and waits for the ALB to actually get an address
5. Points `argocd-dev.rashmidevops.xyz` at that ALB via `scripts/update-dns.sh`

Ends by printing the ArgoCD admin password and the URL. If any phase fails, the script's own error message tells you exactly which one and what to check — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if it's not obvious from that.

**Verify:**
```bash
curl -sk -o /dev/null -w "%{http_code}\n" "https://argocd-dev.rashmidevops.xyz"
```
Expect `200` (DNS can take a few minutes to propagate globally even after the script's own `update-dns.sh` step confirms the Route53 change itself succeeded — if this returns a connection error immediately after the script finishes, wait 2-3 minutes and retry before assuming something's wrong).

## 7. Deploy dev

```bash
kubectl apply -f ../employee-task-gitops/apps/dev-application.yaml
```

ArgoCD shows the app as `OutOfSync` until an image with a real tag exists. Push to the `develop` branch (via GitHub Actions) or run the Jenkins job on `develop` — either pipeline builds, tests, scans, pushes to ECR, and updates `employee-task-gitops` automatically (see [EXECUTION.md](./EXECUTION.md)). ArgoCD picks it up within a few minutes.

**Verify the Ingress got an ALB before touching DNS:**
```bash
kubectl -n employee-task-dev get ingress employee-task-dev-ingress
```
Wait until `ADDRESS` is populated (not blank) — this can take 2-3 minutes after ArgoCD first syncs. Then:

```bash
ALB_HOSTNAME=$(kubectl -n employee-task-dev get ingress employee-task-dev-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
../employee-task-infra/scripts/update-dns.sh upsert dev-app.rashmidevops.xyz "$ALB_HOSTNAME"
../employee-task-infra/scripts/update-dns.sh upsert dev-api.rashmidevops.xyz "$ALB_HOSTNAME"
```

```bash
./scripts/verify-deployment.sh dev <the image tag CI just pushed>
```

## 8. Repeat for prod

Same as steps 5-7, pointed at `environments/prod`, `install-cluster-addons.sh prod`, `employee-task-gitops/apps/prod-application.yaml`, and the `app`/`api` hostnames. Push to `main` to deploy. Remember: prod's ArgoCD Application has no auto-sync — after CI updates Git, run `argocd app sync employee-task-prod` deliberately.

## Which CI/CD pipeline should I actually turn on?

Both `.github/workflows/ci-cd.yml` and `Jenkinsfile` are complete, working pipelines — pick one to actually auto-trigger. **Don't enable both to auto-trigger on the same push** — they'd race to update the GitOps repo. See [ARCHITECTURE.md](./ARCHITECTURE.md#why-two-ci-cd-pipelines-share-scripts).
