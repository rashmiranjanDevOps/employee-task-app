# DESTROY-GUIDE.md

Reverse order of `EXECUTION-GUIDE.md`. Do prod and dev fully before touching global (global also removes the Jenkins server). **Each environment has TWO ALBs** — the app's and ArgoCD's own — both must come down before `terraform destroy` touches the VPC.

---

## PHASE 1 — Delete both Ingresses, per environment (deletes both ALBs)

```bash
# DIRECTORY: anywhere
aws eks update-kubeconfig --name employee-task-prod --region us-east-1
kubectl -n employee-task-prod delete ingress employee-task-prod-ingress
kubectl -n argocd delete ingress argocd-server

aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl -n employee-task-dev delete ingress employee-task-dev-ingress
kubectl -n argocd delete ingress argocd-server
```

**Verify (both ALBs, both environments, actually gone — takes 1-2 minutes):**
```bash
aws elbv2 describe-load-balancers --region us-east-1 --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-employeet') || contains(LoadBalancerName, 'k8s-argocd')].LoadBalancerName"
```
Expect an empty list before continuing.

---

## PHASE 2 — Delete DNS records

```bash
# DIRECTORY: ~/projects/employee-task-infra
cd ~/projects/employee-task-infra
./scripts/update-dns.sh delete app.rashmidevops.xyz
./scripts/update-dns.sh delete api.rashmidevops.xyz
./scripts/update-dns.sh delete argocd-prod.rashmidevops.xyz
./scripts/update-dns.sh delete dev-app.rashmidevops.xyz
./scripts/update-dns.sh delete dev-api.rashmidevops.xyz
./scripts/update-dns.sh delete argocd-dev.rashmidevops.xyz
```
Each of these looks up its record's current value itself — nothing to know or paste by hand.

---

## PHASE 3 — Uninstall cluster add-ons, per environment

```bash
# DIRECTORY: anywhere
aws eks update-kubeconfig --name employee-task-prod --region us-east-1
helm uninstall argocd -n argocd
kubectl delete namespace argocd
helm uninstall aws-load-balancer-controller -n kube-system

aws eks update-kubeconfig --name employee-task-dev --region us-east-1
helm uninstall argocd -n argocd
kubectl delete namespace argocd
helm uninstall aws-load-balancer-controller -n kube-system
```

---

## PHASE 4 — Destroy prod

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/environments/prod
cd ~/projects/employee-task-infra/terraform/environments/prod
terraform destroy -var-file=terraform.tfvars
```
Type `yes`. Takes ~10-15 minutes.

**Verify:**
```bash
aws eks describe-cluster --name employee-task-prod --region us-east-1 2>&1 | grep -q "ResourceNotFoundException" && echo "OK: cluster gone"
```

---

## PHASE 5 — Destroy dev

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/environments/dev
cd ~/projects/employee-task-infra/terraform/environments/dev
terraform destroy -var-file=terraform.tfvars
```
Type `yes`.

**Verify:**
```bash
aws eks describe-cluster --name employee-task-dev --region us-east-1 2>&1 | grep -q "ResourceNotFoundException" && echo "OK: cluster gone"
```

---

## PHASE 6 — Destroy global (ECR, ACM, GitHub OIDC role, Jenkins)

```bash
# DIRECTORY: ~/projects/employee-task-infra/terraform/global
cd ~/projects/employee-task-infra/terraform/global
terraform destroy \
  -var="jenkins_admin_cidr=<YOUR_IP>/32" \
  -var="jenkins_ssh_key_name=employee-task-jenkins-key"
```
Type `yes`. This deletes every image in ECR and the Jenkins server permanently. If you want to keep Jenkins around, stop here and skip this phase.

**Verify:**
```bash
aws ecr describe-repositories --region us-east-1 --query "repositories[?starts_with(repositoryName, 'employee-task')].repositoryName"
```
Expect an empty list.

---

## PHASE 7 — Tear down the Terraform state backend (optional, only if fully done)

```bash
# DIRECTORY: anywhere
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 rb "s3://employee-task-tfstate-${ACCOUNT_ID}" --force
aws dynamodb delete-table --table-name employee-task-tf-locks --region us-east-1
```

---

## PHASE 8 — Verify nothing was left behind

- [ ] **EC2 → Load Balancers / Target Groups** — empty
- [ ] **EC2 → Instances** — empty (the Jenkins box should be gone if you ran Phase 6)
- [ ] **EC2 → Elastic IPs** — none showing "unassociated"
- [ ] **Route53 → Hosted zone** → `rashmidevops.xyz` → confirm `app`, `api`, `argocd-prod`, `dev-app`, `dev-api`, `argocd-dev` records are gone (Phase 2 — the one step nothing else automates)
- [ ] **CloudWatch → Log groups** — no `/aws/eks/employee-task-*` groups remain
- [ ] **Secrets Manager** — no `employee-task-*` secrets remain
- [ ] **ECR → Repositories** — `employee-task-backend`, `employee-task-frontend` are gone
- [ ] **IAM → Roles** — no `employee-task-*-alb-controller-irsa` roles remain

If anything's still there, it's a leftover Terraform doesn't own — track down what created it and remove it manually before you stop paying attention to the account.
