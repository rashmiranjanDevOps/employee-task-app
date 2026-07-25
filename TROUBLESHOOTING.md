# TROUBLESHOOTING.md

## Terraform (employee-task-infra)

**`Error: Error acquiring the state lock`**
A previous `apply`/`plan` didn't exit cleanly. Confirm no one else is actually applying, then:
```bash
terraform force-unlock <lock-id>   # the ID is in the error message
```

**`terraform apply` in `environments/dev` or `environments/prod` fails with an ECR/ACM "already exists" error**
`terraform/global` was applied more than once from different state, or one environment's apply is trying to recreate something global. `terraform/global` must be applied exactly once, before either environment.

**`data.aws_route53_zone.this: no matching Route53Zone found`**
The zone lookup expects `rashmidevops.xyz` to already exist as a hosted zone in this account. If it doesn't, create it manually and re-point the registrar's nameservers at it first.

**ACM certificate stuck in `PENDING_VALIDATION` well past `terraform apply` finishing (or the apply itself times out around 20 minutes)**
This is almost always DNS delegation, not a Terraform bug — the dependency chain (`aws_acm_certificate_validation` → the Route53 validation record → the certificate) is already correct; it's actually waiting on the domain's nameservers to be live. Check:
```bash
dig NS rashmidevops.xyz +short
```
If this doesn't return AWS nameservers (`ns-....awsdns-....`), DNS delegation hasn't propagated yet — wait and retry. This is exactly what [INSTALL.md](./INSTALL.md)'s prerequisites check is meant to catch *before* you spend 20 minutes waiting on an apply that was never going to succeed.

**`terraform apply` in an environment fails or hangs on a `kubernetes_namespace`/`kubernetes_secret` resource**
Confirm `kubectl get nodes` works independently first (`aws eks update-kubeconfig --name employee-task-<env> --region us-east-1`) — if that fails too, the cluster itself isn't ready yet, not a Terraform-specific problem. The `kubernetes` provider here authenticates via `aws eks get-token` (an exec plugin) specifically so a long apply doesn't fail on an expired static token — if you still see an auth error, confirm the AWS CLI itself is authenticated (`aws sts get-caller-identity`) in the same shell Terraform is running in.

## Ansible (employee-task-infra)

**`UNREACHABLE! ... Failed to connect to the host via ssh`**
Confirm `inventory.ini` has the current `jenkins_public_ip` (it changes if the instance is ever replaced) and the right private key path. Also confirm the security group's `admin_cidr` still matches your current IP — it changes if you're on a different network than when you ran `terraform apply`.

**Playbook fails on the Jenkins apt repository step**
Jenkins occasionally rotates their signing key. Check https://www.jenkins.io/download/ for the current key URL and update `jenkins.yml`'s `Add Jenkins apt key` task if this happens.

**Re-running the playbook seems to do nothing**
That's expected — most tasks use `state: present` or `creates: ...`, so a second run only touches what's actually different from the desired state. Check the play recap: `changed=0` means everything was already correct, not that the run failed.

## scripts/install-cluster-addons.sh (employee-task-infra)

This script fails loudly and tells you which phase failed and why — read its error message first; the entries below are for when the error itself isn't self-explanatory.

**"alb_controller_irsa_role_arn is empty"**
`terraform apply` in `terraform/environments/<env>` either hasn't been run, or failed partway through. Run it (or re-run it) before this script.

**"ServiceAccount annotation is '', expected 'arn:aws:iam::...'"**
The Helm install ran, but the `serviceAccount.annotations` flag didn't take — check for a typo if you've modified the script, or that you're running a recent-enough `helm` (the escaped annotation key syntax `serviceAccount.annotations."eks\.amazonaws\.com/role-arn"` needs Helm 3.x).

**"the ArgoCD Ingress has no ADDRESS after 5 minutes"**
Check the controller's own logs — the script prints the exact command, but in short:
```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=aws-load-balancer-controller --tail=50
```
Look for `AccessDenied` (IRSA misconfigured — see the IRSA section below) or a certificate-related error (the ACM cert ARN this script substituted in isn't `ISSUED` yet — check `aws acm describe-certificate`).

## IRSA (AWS Load Balancer Controller authentication)

IRSA has two independent parts. Both have to be correct, and a problem in either one produces the *same* symptom (ALB never gets created), so check both explicitly rather than guessing:

**Part 1 — does the IAM role actually have the right permissions?**
```bash
aws iam get-role-policy --role-name employee-task-<env>-alb-controller-irsa --policy-name employee-task-<env>-alb-controller-irsa-policy
```
Should return a policy document with `elasticloadbalancing:*`, `ec2:Describe*`, etc. — the full AWS Load Balancer Controller policy. If this errors with `NoSuchEntity`, `terraform apply` didn't complete in this environment's Terraform, or was applied against a different environment than you think.

**Part 2 — is the running pod actually using that role?**
```bash
kubectl -n kube-system get serviceaccount aws-load-balancer-controller -o jsonpath='{.metadata.annotations}'
```
Should show `eks.amazonaws.com/role-arn` set to the same ARN as Part 1. If it's missing, `install-cluster-addons.sh` either wasn't run, or was run before Part 1's role existed (re-run it — it's idempotent).

**Both correct but still getting `AccessDenied` in the controller's logs?**
```bash
kubectl -n kube-system exec deploy/aws-load-balancer-controller -- printenv | grep AWS_ROLE_ARN
```
If this doesn't match the ServiceAccount's annotation, the pod was scheduled *before* the annotation was applied — delete the pod (`kubectl -n kube-system delete pod -l app.kubernetes.io/name=aws-load-balancer-controller`) to force a fresh one that picks up the current ServiceAccount config.

**This project deliberately has no fallback IAM permissions on the node role** — if IRSA is broken, the controller has *no* working AWS credentials at all, not degraded ones. That's intentional (see [ARCHITECTURE.md](./ARCHITECTURE.md#why-the-aws-load-balancer-controller-uses-irsa)): a fallback would mean this exact class of misconfiguration works anyway and goes unnoticed.

## Kubernetes / EKS

**Pods stuck `Pending`**
```bash
kubectl -n employee-task-dev describe pod <pod-name>
```
Usually not enough node capacity — check `node_max_size` in that environment's `terraform.tfvars`.

**Pods `CrashLoopBackOff`**
```bash
kubectl -n employee-task-dev logs <pod-name> --previous
```
Almost always a missing/wrong env var for the backend — check the Secret Terraform created:
```bash
kubectl -n employee-task-dev get secret employee-task-secrets -o jsonpath='{.data}' | jq 'keys'
```
Expect: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. If missing, re-run `terraform apply` in that environment — that Secret is created there, not by Helm.

**`ImagePullBackOff`**
Either the tag in employee-task-gitops's `environments/dev/values.yaml`/`environments/prod/values.yaml` doesn't exist in ECR yet, or the node's IAM role is missing `AmazonEC2ContainerRegistryReadOnly` (shouldn't be — attached by default).

## Ingress / ALB / DNS

**No ALB gets created at all**
See the **IRSA** section above first — this is the most common cause by far. If IRSA checks out fine:
```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=aws-load-balancer-controller
```
and look for a certificate-related error specifically — the app's Ingress falls back to HTTP-only if `certificateArn` was never set (see [ARCHITECTURE.md](./ARCHITECTURE.md)), so it should never hard-fail on that particular cause, but a *stale* or *invalid* cert ARN (as opposed to a missing one) will still cause a real error here.

**Site doesn't resolve even though the ALB exists (`ADDRESS` is populated on the Ingress)**
DNS is a manual step in this project, but it's scripted, not hand-typed — confirm you ran `scripts/update-dns.sh` (in `employee-task-infra`) with the **current** ALB hostname from `kubectl get ingress`, not a hostname copied from an earlier terminal session or an old doc. The ALB's hostname changes if it's ever recreated (e.g., the Ingress was deleted and re-applied) — a value that was correct yesterday can be wrong today. `update-dns.sh` always does a proper `UPSERT`, so re-running it with the current hostname is always safe and always fixes a stale record.

**503 from the ALB**
Target group health checks are failing. The Ingress's `healthcheck-path` is `/health` — confirm the backend actually responds 200 there.

## ArgoCD

**App stuck `OutOfSync` in dev (which should auto-sync)**
```bash
argocd app get employee-task-dev
```
Check `syncPolicy.automated` is present in employee-task-gitops's `apps/dev-application.yaml` and was applied.

**App shows `Unknown` health status**
Usually a Helm rendering error ArgoCD couldn't apply. Render it locally from a checkout of *this* repo (the chart lives here, not in employee-task-gitops) to see the real error:
```bash
helm template helm/employee-task -f ../employee-task-gitops/environments/dev/values.yaml
```

**Can't reach the ArgoCD UI at all (`argocd-<env>.rashmidevops.xyz` doesn't resolve or times out)**
`install-cluster-addons.sh` handles ArgoCD's own Ingress + DNS as part of its normal run — if this doesn't work, re-run that script (it's idempotent) and read its phase-by-phase output for exactly which step failed, rather than debugging this by hand.

## CI/CD (either pipeline)

**GitHub Actions: `configure-aws-credentials` fails with `AccessDenied`**
The `AWS_ROLE_ARN` secret doesn't match `terraform/global`'s `github_actions_role_arn` output, or the trust policy's `sub` condition doesn't match `repo:rashmiranjandevops/employee-task-app:*`. Re-run `sync-config.sh` if in doubt.

**`update-gitops` job / `Deploy: Update GitOps` stage fails to push**
GitHub Actions: `GITOPS_PAT` is missing, expired, or doesn't have `contents: write` on employee-task-gitops specifically. Jenkins: the `gitops-deploy-key` credential's public key isn't added as a deploy key (with write access) on employee-task-gitops.

**Both pipelines deployed the same push and now `environments/dev/values.yaml` has a confusing history**
Both auto-triggers were enabled at once. Disable one — see ARCHITECTURE.md. This isn't a bug in the scripts; it's a "only one pipeline should be live at a time" configuration issue.

**Jenkins job fails immediately with "command not found" for kubectl/helm/trivy/yq**
Ansible hasn't been re-run since a fresh Jenkins server was provisioned, or the playbook run failed partway through. Re-run `ansible-playbook jenkins.yml` and check the play recap for failures.

## Slack notifications

**No Slack messages arriving**
`SLACK_WEBHOOK_URL` isn't set — `notify-slack.sh` deliberately no-ops rather than failing the pipeline when it's missing. Check the pipeline logs for "SLACK_WEBHOOK_URL not set" to confirm that's what's happening versus a real delivery failure.

## Monitoring

**Grafana dashboard shows "No data"**
Confirm Prometheus is scraping the backend: http://localhost:9090/targets should show `employee-task-backend` as `UP`.

---

If a problem isn't covered here: reproduce it with the smallest possible repro (`docker compose up` locally, or `kubectl` directly against dev — not prod), and check the specific component's logs before assuming the whole platform is broken. Most failures in a project this size trace back to exactly one misconfigured value, not a systemic issue.
