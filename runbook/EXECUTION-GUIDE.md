# EXECUTION-GUIDE.md

One terminal, moving between 3 directories in order. Every command block starts with a comment telling you exactly where you should be. Complete `PREREQUISITES.md` first — specifically the DNS delegation check, which is the single most common reason Phase 2 below hangs.

Total time: ~50-70 minutes, most of it waiting on `terraform apply` (EKS takes 15-20 min per environment) and ACM validation (a few minutes, assuming DNS is actually delegated).

Every phase ends with a **Verify** block. Don't skip it and move to the next phase anyway — the failure modes downstream are much harder to diagnose than the ones these checks catch immediately.

---

## PHASE 1 — Terraform backend

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform
cd ~/projects/employee-task-infra/terraform
../scripts/bootstrap-backend.sh us-east-1
```
Copy the bucket name it prints, then:

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform
BUCKET_NAME="<paste-the-printed-bucket-name>"
sed -i.bak "s/employee-task-tfstate-REPLACE_ME/${BUCKET_NAME}/" \
  global/backend.hcl environments/dev/backend.hcl environments/prod/backend.hcl
rm -f global/backend.hcl.bak environments/dev/backend.hcl.bak environments/prod/backend.hcl.bak
```

**Verify:**
```bash
aws s3 ls | grep employee-task-tfstate
aws dynamodb describe-table --table-name employee-task-tf-locks --region us-east-1 --query "Table.TableStatus"
```
Expect the bucket listed, and `"ACTIVE"`.

---

## PHASE 2 — Global infrastructure (ECR, ACM, GitHub OIDC role, Jenkins EC2)

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/global
cd global
terraform init -backend-config=backend.hcl
terraform apply \
  -var="jenkins_admin_cidr=<YOUR_IP>/32" \
  -var="jenkins_ssh_key_name=employee-task-jenkins-key"
```
Type `yes` when prompted. Takes ~3-5 minutes if DNS is actually delegated (see PREREQUISITES.md step 4) — up to ~20 minutes and a timeout if it isn't.

**Verify:**
```bash
terraform output acm_certificate_arn
aws acm describe-certificate --certificate-arn "$(terraform output -raw acm_certificate_arn)" --region us-east-1 --query "Certificate.Status"
```
Expect `"ISSUED"`. If it's `"PENDING_VALIDATION"`, go back and re-check `dig NS rashmidevops.xyz +short` — don't continue past this point until it's `"ISSUED"`.

Keep this terminal open — you'll copy values from `terraform output` several times below.

---

## PHASE 3 — Configure the Jenkins server (Ansible)

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/global
JENKINS_IP=$(terraform output -raw jenkins_public_ip)
echo "$JENKINS_IP"
```

```bash
# DIRECTORY: ~/projects/employee-task-infra/ansible
cd ../../ansible
cp inventory.ini.example inventory.ini
```
Edit `inventory.ini` now — replace `REPLACE_WITH_JENKINS_PUBLIC_IP` with the IP printed above, and `YOUR_KEY.pem` with `~/.ssh/employee-task-jenkins-key.pem`.

```bash
# DIRECTORY: ~/projects/employee-task-infra/ansible
ansible-playbook jenkins.yml
```
Takes ~5 minutes. Prints the Jenkins initial admin password at the end — copy it.

**Verify:**
```bash
curl -sf -o /dev/null -w "%{http_code}\n" "http://${JENKINS_IP}:8080/login"
```
Expect `200`.

```bash
open "http://$JENKINS_IP:8080"     # macOS
# or paste http://<JENKINS_IP>:8080 into a browser
```
Paste the admin password, click through "Install suggested plugins," create your admin user.

**In the Jenkins UI**, add these credentials (Manage Jenkins → Credentials → System → Global credentials → Add Credentials):
1. Kind: *Username with password* → ID: `aws-ecr-credentials` → your AWS access key / secret key
2. Kind: *SSH Username with private key* → ID: `gitops-deploy-key` → paste a private key you'll add as a deploy key on `employee-task-gitops` in the next phase
3. Kind: *Secret text* → ID: `slack-webhook-url` → your Slack webhook URL (optional)
4. Kind: *Secret text* → ID: `ecr-registry-url` → the registry part of the ECR URLs:
```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/global
terraform output ecr_repository_urls
```

**Add the deploy key to `employee-task-gitops`**: GitHub → `employee-task-gitops` → Settings → Deploy keys → Add deploy key → paste the *public* key matching what you gave Jenkins → check "Allow write access."

---

## PHASE 4 — Sync config into employee-task-gitops + GitHub secrets

```bash
# DIRECTORY: ~/projects/employee-task-app
cd ~/projects/employee-task-app
../employee-task-infra/scripts/sync-config.sh ../employee-task-gitops
```
Commits + pushes to `employee-task-gitops` automatically, and prints 5 values.

**Verify — confirm the values actually landed:**
```bash
grep -A1 "^image:" ../employee-task-gitops/environments/dev/values.yaml
grep "certificateArn" ../employee-task-gitops/environments/dev/values.yaml
```
Neither should show an empty `""`.

**In the GitHub UI**, go to `employee-task-app` → Settings → Secrets and variables → Actions, and add exactly what the script printed:

| Type | Name |
|---|---|
| Secret | `AWS_ROLE_ARN` |
| Variable | `AWS_REGION` |
| Variable | `ECR_REGISTRY` |
| Variable | `GITOPS_REPO` |
| Variable | `APP_DOMAIN` |

Plus 2 more the script can't print:
| Type | Name | Value |
|---|---|---|
| Secret | `GITOPS_PAT` | the fine-grained PAT from Prerequisites step 7 |
| Secret | `SLACK_WEBHOOK_URL` | your webhook URL (optional) |

---

## PHASE 5 — Apply the dev environment

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/environments/dev
cd ~/projects/employee-task-infra/terraform/environments/dev
terraform init -backend-config=backend.hcl
terraform apply -var-file=terraform.tfvars
```
Type `yes`. Takes ~15-20 minutes.

**Verify:**
```bash
aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl get nodes
kubectl get secret employee-task-secrets -n employee-task-dev -o jsonpath='{.data}' | jq 'keys'
```
Expect a `Ready` node, and the secret keys: `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USER`, `JWT_REFRESH_SECRET`, `JWT_SECRET`.

---

## PHASE 6 — Install cluster add-ons (dev)

```bash
# DIRECTORY: ~/projects/employee-task-infra
cd ~/projects/employee-task-infra
./scripts/install-cluster-addons.sh dev
```
Takes ~6-8 minutes. This one script installs the AWS Load Balancer Controller (with a correctly-annotated IRSA ServiceAccount — it verifies this itself before continuing), ArgoCD, ArgoCD's own Ingress, and points `argocd-dev.rashmidevops.xyz` at it. It prints its own verification output at every phase; if it stops with an error, fix that before re-running it (it's idempotent — safe to re-run from the top). Ends by printing the ArgoCD admin password — copy it.

**Verify:**
```bash
curl -sk -o /dev/null -w "%{http_code}\n" "https://argocd-dev.rashmidevops.xyz"
```
Expect `200` (if you get a connection error immediately, wait 2-3 minutes for DNS to propagate globally and retry before assuming something's wrong).

---

## PHASE 7 — Point ArgoCD at employee-task-gitops (dev)

```bash
# DIRECTORY: ~/projects/employee-task-infra
kubectl apply -f ../employee-task-gitops/apps/dev-application.yaml
kubectl -n argocd get applications
```
You'll see `employee-task-dev` as `OutOfSync` — expected, there's no image tag yet.

---

## PHASE 8 — Trigger the first deploy

Pick ONE of these (see `ARCHITECTURE.md` for why not both):

**Option A — GitHub Actions:**
```bash
# DIRECTORY: ~/projects/employee-task-app
cd ~/projects/employee-task-app
git checkout -b develop
git push -u origin develop
```
Watch it run: GitHub → `employee-task-app` → Actions tab.

**Option B — Jenkins:**
In the Jenkins UI: New Item → Pipeline → point it at your `employee-task-app` repo, branch `develop` → Build Now.

Either way, this builds, tests, scans, pushes to ECR, and updates `employee-task-gitops/environments/dev/values.yaml` — watch for a new commit there.

---

## PHASE 9 — Point the app's DNS at its ALB

Wait for ArgoCD to sync (~3 min after the values-file commit lands), then:

```bash
# DIRECTORY: ~/projects/employee-task-infra
kubectl -n employee-task-dev get ingress employee-task-dev-ingress
```
Wait until `ADDRESS` is populated (can take 2-3 minutes after ArgoCD first syncs), then:

```bash
# DIRECTORY: ~/projects/employee-task-infra
ALB_HOSTNAME=$(kubectl -n employee-task-dev get ingress employee-task-dev-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

./scripts/update-dns.sh upsert dev-app.rashmidevops.xyz "$ALB_HOSTNAME"
./scripts/update-dns.sh upsert dev-api.rashmidevops.xyz "$ALB_HOSTNAME"
```

---

## PHASE 10 — Verify

```bash
# DIRECTORY: ~/projects/employee-task-app
cd ~/projects/employee-task-app
IMAGE_TAG=$(cd ../employee-task-gitops && yq '.backend.image.tag' environments/dev/values.yaml)
./scripts/verify-deployment.sh dev "$IMAGE_TAG"
```
Expect `VERIFICATION PASSED for dev`. Then check it in a browser:
```
https://dev-app.rashmidevops.xyz
```

**Dev is done.** ✅

---

## PHASE 11 — Repeat for prod

Same shape as Phases 5-9, pointed at prod:

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/environments/prod
cd ~/projects/employee-task-infra/terraform/environments/prod
terraform init -backend-config=backend.hcl
terraform apply -var-file=terraform.tfvars

# DIRECTORY: ~/projects/employee-task-infra
cd ~/projects/employee-task-infra
./scripts/install-cluster-addons.sh prod
kubectl apply -f ../employee-task-gitops/apps/prod-application.yaml
```

```bash
# DIRECTORY: ~/projects/employee-task-app
cd ~/projects/employee-task-app
git checkout main
git merge develop
git push origin main
```

Watch CI run against `main` — it tags the image `prod-<sha>` and updates `environments/prod/values.yaml`. Unlike dev, **nothing deploys automatically** — you have to say so:

```bash
argocd login argocd-prod.rashmidevops.xyz
argocd app sync employee-task-prod
argocd app wait employee-task-prod --health --timeout 300
```

```bash
# DIRECTORY: ~/projects/employee-task-infra
ALB_HOSTNAME=$(kubectl -n employee-task-prod get ingress employee-task-prod-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
./scripts/update-dns.sh upsert app.rashmidevops.xyz "$ALB_HOSTNAME"
./scripts/update-dns.sh upsert api.rashmidevops.xyz "$ALB_HOSTNAME"
```

```bash
# DIRECTORY: ~/projects/employee-task-app
IMAGE_TAG=$(cd ../employee-task-gitops && yq '.backend.image.tag' environments/prod/values.yaml)
./scripts/verify-deployment.sh prod "$IMAGE_TAG"
```

```
https://app.rashmidevops.xyz
```

**Both environments are live.** For day-to-day changes after this, see `EXECUTION.md` (not this file) — this guide is the one-time path from nothing to a working platform. When you're done and want to tear it all down, see `DESTROY-GUIDE.md`.
