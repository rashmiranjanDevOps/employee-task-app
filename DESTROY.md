# DESTROY.md

Tear down in the **reverse** order of [INSTALL.md](./INSTALL.md), and tear down BOTH environments before touching `terraform/global` (which also removes the Jenkins server). Each step includes a way to confirm it actually finished before moving to the next — skipping ahead is how orphaned resources happen.

**Each environment has TWO ALBs**, not one: the application's (from `employee-task-<env>-ingress`) and ArgoCD's own UI (from `argocd-server`, applied by `install-cluster-addons.sh`). Both need to come down before `terraform destroy` touches the VPC, or it will fail with a dangling ENI/security-group dependency error.

## 1. Delete both Ingresses (this deletes both ALBs)

```bash
aws eks update-kubeconfig --name employee-task-dev --region us-east-1
kubectl -n employee-task-dev delete ingress employee-task-dev-ingress
kubectl -n argocd delete ingress argocd-server
```

**Verify both ALBs are actually gone** before continuing (EC2 → Load Balancers in the console, or):
```bash
aws elbv2 describe-load-balancers --region us-east-1 --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-employeet') || contains(LoadBalancerName, 'k8s-argocd')].LoadBalancerName"
```
Expect an empty list. This can take 1-2 minutes after the `kubectl delete` — don't move on until it's actually empty, not just "probably done by now."

## 2. Delete the DNS records

```bash
cd employee-task-infra
./scripts/update-dns.sh delete dev-app.rashmidevops.xyz
./scripts/update-dns.sh delete dev-api.rashmidevops.xyz
./scripts/update-dns.sh delete argocd-dev.rashmidevops.xyz
```
`update-dns.sh delete` looks up each record's current value itself — there's no value to know or paste by hand here, unlike earlier versions of this doc.

## 3. Uninstall cluster add-ons

```bash
helm uninstall argocd -n argocd
kubectl delete namespace argocd
helm uninstall aws-load-balancer-controller -n kube-system
```

**Verify:**
```bash
kubectl get namespace argocd 2>&1 | grep -q "not found" && echo "OK: argocd namespace gone"
```

## 4. Destroy the environment

```bash
cd terraform/environments/dev
terraform destroy -var-file=terraform.tfvars
```
Removes the EKS cluster, node group, IRSA role, RDS instance, VPC, and the Kubernetes namespace/Secret for this environment.

**Verify:**
```bash
aws eks describe-cluster --name employee-task-dev --region us-east-1 2>&1 | grep -q "ResourceNotFoundException" && echo "OK: cluster gone"
```

Repeat steps 1-4 for `prod` before continuing to step 5.

## 5. Destroy global resources (only once BOTH environments are gone)

```bash
cd ../../global
terraform destroy \
  -var="jenkins_admin_cidr=<your-ip>/32" \
  -var="jenkins_ssh_key_name=<your-ec2-key-pair-name>"
```
Removes the ECR repos (**and every image tag in them**), the ACM certificate, the GitHub Actions OIDC role, and the Jenkins EC2 instance — Jenkins job history and any configuration only Ansible/the UI set up is gone with it. If you want to keep Jenkins, skip destroying `global` (or comment out the `jenkins_server` module call before applying elsewhere).

**Verify:**
```bash
aws ecr describe-repositories --region us-east-1 --query "repositories[?starts_with(repositoryName, 'employee-task')].repositoryName"
```
Expect an empty list.

## 6. Tear down the Terraform state backend (optional)

Only do this if you're completely done with the project.
```bash
aws s3 rb s3://employee-task-tfstate-<account-id> --force
aws dynamodb delete-table --table-name employee-task-tf-locks --region us-east-1
```

## Checking for cost leaks afterward

- **EC2 → Load Balancers / Target Groups** — should be empty (step 1 should have caught this, for both ALBs)
- **EC2 → Instances** — the Jenkins instance should be gone after step 5
- **Route53 → Hosted zone records** — `dev-app`, `dev-api`, `argocd-dev`, `app`, `api`, `argocd-prod` should all be gone (step 2 — the one thing nothing else removes automatically)
- **EC2 → Elastic IPs** — each environment's NAT Gateway EIP is released automatically, but confirm none are left "unassociated" (still billed)
- **CloudWatch → Log groups** — `/aws/eks/employee-task-dev/cluster` and `/aws/eks/employee-task-prod/cluster` are deleted by Terraform, but verify
- **Secrets Manager** — both environments' DB credential secrets have `recovery_window_in_days = 0`, so they should disappear immediately
- **IAM → Roles** — no `employee-task-*-alb-controller-irsa` roles should remain after step 4
