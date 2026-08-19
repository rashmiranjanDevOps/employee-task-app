# TROUBLESHOOTING.md

## Terraform (employee-task-infra)

**`Error: Error acquiring the state lock`**
A previous `apply`/`plan` didn't exit cleanly. Confirm no one else is actually applying, then:
```bash
terraform force-unlock <lock-id>   # the ID is in the error message
```

**`data.aws_route53_zone.this: no matching Route53Zone found`**
The zone lookup expects your domain to already exist as a hosted zone in this account. If it doesn't, create it manually and re-point your registrar's nameservers at it first.

**ACM certificate stuck in `PENDING_VALIDATION` well past `terraform apply` finishing (or the apply itself times out around 20 minutes)**
Almost always DNS delegation, not a Terraform bug — the dependency chain (`aws_acm_certificate_validation` → the Route53 validation record → the certificate) is already correct; it's actually waiting on the domain's nameservers to be live. Check:
```bash
dig NS yourdomain.com +short
```
If this doesn't return AWS nameservers (`ns-....awsdns-....`), DNS delegation hasn't propagated yet — wait and retry.

**`terraform apply` fails or hangs on a `kubernetes_namespace`/`kubernetes_secret` resource**
Confirm `kubectl get nodes` works independently first (`aws eks update-kubeconfig --name employee-task-dev --region us-east-1`) — if that fails too, the cluster itself isn't ready yet. The `kubernetes` provider authenticates via `aws eks get-token` (an exec plugin) so a long apply doesn't fail on an expired static token — if you still see an auth error, confirm `aws sts get-caller-identity` works in the same shell.

## Jenkins server (employee-task-infra)

**Jenkins UI not reachable at all**
Wait 2-3 minutes after `terraform apply` — `user-data.sh` takes a little while to install everything on first boot. Then check `jenkins_admin_cidr` in your `terraform.tfvars` still matches your current IP (`curl -s https://checkip.amazonaws.com`).

**Jenkins job fails immediately with "command not found" for kubectl/helm/trivy/yq**
SSH in and check `/var/log/cloud-init-output.log` for where `user-data.sh` stopped:
```bash
ssh -i ~/.ssh/employee-task-jenkins-key.pem ubuntu@<jenkins-ip>
sudo tail -100 /var/log/cloud-init-output.log
```

## scripts/install-cluster-addons.sh (employee-task-infra)

This script fails loudly and tells you which phase failed and why — read its error message first; the entries below are for when the error itself isn't self-explanatory.

**"alb_controller_irsa_role_arn is empty"**
`terraform apply` either hasn't been run, or failed partway through. Run it (or re-run it) before this script.

**"ServiceAccount annotation is '', expected 'arn:aws:iam::...'"**
The Helm install ran, but the `serviceAccount.annotations` flag didn't take — check for a typo if you've modified the script, or that you're running a recent-enough `helm` (the escaped annotation key syntax needs Helm 3.x).

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
aws iam get-role-policy --role-name employee-task-dev-alb-controller-irsa --policy-name employee-task-dev-alb-controller-irsa-policy
```
Should return a policy document with `elasticloadbalancing:*`, `ec2:Describe*`, etc. If this errors with `NoSuchEntity`, `terraform apply` didn't complete.

**Part 2 — is the running pod actually using that role?**
```bash
kubectl -n kube-system get serviceaccount aws-load-balancer-controller -o jsonpath='{.metadata.annotations}'
```
Should show `eks.amazonaws.com/role-arn` set to the same ARN as Part 1. If it's missing, `install-cluster-addons.sh` either wasn't run, or was run before Part 1's role existed (re-run it — it's idempotent).

**Both correct but still getting `AccessDenied` in the controller's logs?**
```bash
kubectl -n kube-system exec deploy/aws-load-balancer-controller -- printenv | grep AWS_ROLE_ARN
```
If this doesn't match the ServiceAccount's annotation, the pod was scheduled *before* the annotation was applied — delete the pod (`kubectl -n kube-system delete pod -l app.kubernetes.io/name=aws-load-balancer-controller`) to force a fresh one.

**This project deliberately has no fallback IAM permissions on the node role** — if IRSA is broken, the controller has *no* working AWS credentials at all, not degraded ones. A fallback would mean this exact class of misconfiguration works anyway and goes unnoticed.

## Kubernetes / EKS

**Pods stuck `Pending`**
```bash
kubectl -n employee-task-dev describe pod <pod-name>
```
Usually not enough node capacity — check `node_max_size` in `terraform.tfvars`.

**Pods `CrashLoopBackOff`**
```bash
kubectl -n employee-task-dev logs <pod-name> --previous
```
Almost always a missing/wrong env var for the backend — check the Secret Terraform created:
```bash
kubectl -n employee-task-dev get secret employee-task-secrets -o jsonpath='{.data}' | jq 'keys'
```
Expect: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. If missing, re-run `terraform apply` — that Secret is created there, not by Helm.

**`ImagePullBackOff`**
Either the tag in this repo's `helm/employee-task/values.yaml` doesn't exist in ECR yet, or the node's IAM role is missing `AmazonEC2ContainerRegistryReadOnly` (shouldn't be — attached by default).

## Ingress / ALB / DNS

**No ALB gets created at all**
See the **IRSA** section above first — this is the most common cause by far. If IRSA checks out fine:
```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=aws-load-balancer-controller
```
and look for a certificate-related error specifically — the Ingress falls back to HTTP-only if `certificateArn` was never set, so it should never hard-fail on that particular cause, but a *stale* or *invalid* cert ARN will still cause a real error here.

**Site doesn't resolve even though the ALB exists (`ADDRESS` is populated on the Ingress)**
DNS is a manual step in this project, but it's scripted, not hand-typed — confirm you ran `scripts/update-dns.sh` (in `employee-task-infra`) with the **current** ALB hostname from `kubectl get ingress`, not a hostname copied from an earlier terminal session. The ALB's hostname changes if it's ever recreated. `update-dns.sh` always does a proper `UPSERT`, so re-running it with the current hostname is always safe.

**503 from the ALB**
Target group health checks are failing. The Ingress's `healthcheck-path` is `/health` — confirm the backend actually responds 200 there.

**Frontend loads but API calls fail (404 or CORS error)**
The frontend calls the API with a relative path (`/api/v1/...`), routed by the Ingress to the backend Service — check `kubectl -n employee-task-dev get ingress employee-task-dev-ingress -o yaml` and confirm the `/api` path rule exists and points at the backend Service, not the frontend one.

## ArgoCD

**App stuck `OutOfSync` (which should auto-sync)**
```bash
argocd app get employee-task-dev
```
Check `syncPolicy.automated` is present in employee-task-gitops's `apps/dev-application.yaml` and was applied.

**App shows `Unknown` health status**
Usually a Helm rendering error ArgoCD couldn't apply. Render it locally to see the real error:
```bash
helm template helm/employee-task
```

**Can't reach the ArgoCD UI at all**
`install-cluster-addons.sh` handles ArgoCD's own Ingress + DNS as part of its normal run — if this doesn't work, re-run that script (it's idempotent) and read its phase-by-phase output for exactly which step failed.

## CI/CD (either pipeline)

**GitHub Actions: `configure-aws-credentials` fails with `AccessDenied`**
The `AWS_ROLE_ARN` secret doesn't match Terraform's `github_actions_role_arn` output, or the trust policy's `sub` condition doesn't match your repo. Re-run `sync-config.sh` if in doubt.

**`update-image-tag` job / `Deploy: Update image tag` stage fails to push**
GitHub Actions: check the workflow has `permissions: contents: write` set. Jenkins: the `github-push-token` credential is missing, expired, or doesn't have `contents:write` on this repo.

**Both pipelines deployed the same push and now `values.yaml` has a confusing history**
Both auto-triggers were enabled at once. Disable one — only one pipeline should be "live" (auto-triggered) at a time, though either works fine run manually.

## Slack notifications

**No Slack messages arriving**
`SLACK_WEBHOOK_URL` isn't set — `notify-slack.sh` deliberately no-ops rather than failing the pipeline when it's missing. Check the pipeline logs for "SLACK_WEBHOOK_URL not set" to confirm that's what's happening versus a real delivery failure.

## Monitoring

**Grafana dashboard shows "No data"**
Confirm Prometheus is scraping the backend: http://localhost:9090/targets should show `employee-task-backend` as `UP`.

---

If a problem isn't covered here: reproduce it with the smallest possible repro (`docker compose up` locally, or `kubectl` directly against the cluster), and check the specific component's logs before assuming the whole platform is broken. Most failures in a project this size trace back to exactly one misconfigured value, not a systemic issue..
