# ARCHITECTURE.md

## Project overview

Employee Task Tracker is a full-stack task management app (React + Node.js/Express + MySQL) built to demonstrate the complete DevOps lifecycle for **one real application**: source code → containerized build → tested, scanned CI pipeline → Infrastructure as Code → GitOps-managed Kubernetes deployment → monitoring and alerting.

This is not a reusable platform for multiple teams or applications. Every technology, repo, and script here exists to answer one question: *can this application be built, deployed, and operated reliably, end to end?*

## System overview

```
employee-task-infra                        employee-task-app                    employee-task-gitops
  Terraform: VPC, EKS, RDS,             backend/, frontend/              environments/dev/values.yaml
  ECR, ACM, Route53 lookup,             helm/employee-task/ (the chart)  environments/prod/values.yaml
  GitHub OIDC role, Jenkins EC2         .github/workflows/ci-cd.yml
  Ansible: configures that EC2          Jenkinsfile
  (installs Jenkins, Docker, CLIs)      scripts/ci/*.sh (shared)
        |                                     |
        |                              push to develop/main
        |                                     v
        |                              GitHub Actions OR Jenkins
        |                              checks -> secret scan -> build
        |                              -> scan image -> push to ECR  ---> updates image.tag,
        |                                                                  pushes, notifies Slack
        v                                                                  |
  EKS cluster (dev or prod)                                                v
  backend + frontend pods  <----------------------------------  ArgoCD (multi-source: pulls the
  |            |                                                  CHART from employee-task-app +
  v            v                                                  VALUES from employee-task-gitops;
RDS MySQL   ALB (AWS LB Controller) + DNS record (manual)          auto-syncs dev, manual-syncs prod)
                    |
                    v
     Prometheus (scrapes /metrics) -> Grafana dashboard
                    |
                    v
              Alertmanager -> Slack
```

## Folder structure (this repo)

```
backend/            Express API — JWT auth, tasks, users, audit log, tests
frontend/            React SPA (Vite)
helm/employee-task/  The Helm CHART: Deployments, Services, Ingress, ConfigMap, RBAC, HPA
docker/              docker-compose.yml for local development
monitoring/          Prometheus / Grafana / Alertmanager config
scripts/
  ci/                Shared build/test/deploy logic — called by BOTH pipelines
  rollback.sh, verify-deployment.sh, notify-slack.sh
.github/workflows/   CI/CD pipeline (GitHub Actions)
Jenkinsfile          CI/CD pipeline (Jenkins) — functionally equivalent
runbook/             Copy-paste execution guides (prerequisites, full deploy, full teardown)
```

## Technology stack

| Layer | Technology |
|---|---|
| Application | React, Node.js/Express, MySQL |
| Containerization | Docker, Docker Compose |
| Infrastructure as Code | Terraform |
| Configuration management | Ansible |
| Cloud | AWS (VPC, EKS, RDS, ECR, IAM, Route53, ACM, EC2) |
| CI/CD | GitHub Actions, Jenkins |
| Container orchestration | Kubernetes (EKS), Helm |
| GitOps | ArgoCD |
| Monitoring | Prometheus, Grafana, Alertmanager |
| Notifications | Slack |

## Why three repos

**employee-task-app** changes on every commit. **employee-task-gitops** should only change on every intentional deploy — if it were the same repo as the app, a docs typo and a real image bump would be indistinguishable in the deploy history, and ArgoCD (which watches for *any* change) would sync on both. **employee-task-infra** changes on a completely different cadence again — VPC/EKS/RDS changes are rare, deliberate, and risky enough that they shouldn't share a repo (or a CI pipeline) with routine app commits.

This also maps onto how a real team would eventually divide ownership: someone infra-focused could own `employee-task-infra` without needing write access to application code, and vice versa. That's the actual justification for 3 repos — a real separation of change frequency and (eventually) of who should be allowed to change what — not "more repos looks more thorough." All 3 repos exist in service of deploying and operating this one application; none of them are structured to be reused by a second app.

## Why the Helm chart lives in employee-task-app, not employee-task-gitops

The chart (`helm/employee-task/`) — its templates and its default `values.yaml` — is part of how this application is packaged for deployment, the same way its `Dockerfile` is. It changes when the application's shape changes: a new environment variable, a new port, a new probe path. Those changes belong in the same pull request as the code change that requires them, reviewed together, not split across two repos.

`employee-task-gitops` holds only what's genuinely environment-specific and deploy-triggered: `environments/dev/values.yaml` and `environments/prod/values.yaml`, plus the two ArgoCD Applications. This is what actually changes on every deploy (an image tag), and nothing else.

**The mechanical consequence of this split**: ArgoCD needs to combine a chart from one repo with values from another. It does this with a **multi-source Application** — a real, documented ArgoCD feature (v2.6+), not a workaround. Each Application (`employee-task-gitops/apps/dev-application.yaml`) lists two sources: one pointing at `employee-task-app`'s `helm/employee-task/` path for the chart, one pointing at `employee-task-gitops` for the values file, referenced via `$values/environments/dev/values.yaml`. This is the one part of this project that looks like more machinery than the rest — it's the direct, unavoidable result of the chart/values split, not an added layer for its own sake.

## Why Terraform provisions the Jenkins server but Ansible configures it

Terraform is declarative infrastructure: "this EC2 instance, this security group, this IAM role should exist." It's a poor fit for "install these 8 packages, start these 2 services, in this order" — that's configuration management, which is what Ansible is built for. `employee-task-infra/terraform/modules/jenkins-server` creates a bare Ubuntu box with the right IAM role and security group and stops there. `employee-task-infra/ansible/jenkins.yml` does everything after: Java, Jenkins itself, Docker, and every CLI tool (`kubectl`, `helm`, `trivy`, `yq`, `jq`, `aws-cli`, Node.js) the Jenkinsfile's stages call directly.

The alternative — cramming all of that into Terraform's `user_data` as one long shell script — works, but "what software is actually on this box" ends up buried inside a Terraform resource instead of being its own readable, idempotent, individually-rerunnable file.

## Why two CI/CD pipelines share scripts

Both `.github/workflows/ci-cd.yml` and `Jenkinsfile` implement the same pipeline: checks → secret scan → build → scan → push → deploy → notify. Rather than writing that logic twice (and having it quietly drift — a Trivy severity threshold changed in one place and not the other is exactly the kind of bug that's invisible until it matters), the actual logic lives once, in `scripts/ci/*.sh` and `scripts/notify-slack.sh`. Each pipeline is a thin wrapper: authenticate to AWS its own way (GitHub Actions: OIDC; Jenkins: stored credentials), then call the same scripts.

**Only enable one to auto-trigger at a time.** Both are fully capable of deploying — that's the point — but if both fired on the same push, they'd race to update the same file in employee-task-gitops.

## Why two environments

Dev and prod run on **fully separate EKS clusters and VPCs** — real environment isolation, not a namespace-only split on one cluster. Each gets its own `terraform apply`, its own values file, its own ArgoCD Application. The account-level resources both share (ECR, the ACM cert, the GitHub OIDC role, the one shared Jenkins server) live in `terraform/global` specifically so applying dev and applying prod never try to create the same account-scoped resource twice from two different state files.

Only two — not a third staging/QA environment — because a third environment configured identically to prod teaches "I can copy a config file," not a new concept.

## Why the Route53 zone is looked up, not created

The domain (`rashmidevops.xyz`) is already registered with its nameservers already pointed at Route53 — the hosted zone already exists. Terraform looks it up (`data "aws_route53_zone"`) instead of creating one, so there's no risk of Terraform ever trying to manage (or accidentally delete) a zone that DNS delegation for the whole domain depends on.

## Why the DNS record is a manual step

The AWS Load Balancer Controller creates the ALB dynamically from the Ingress resource — Terraform can't know its DNS name ahead of time. The fully-automatic answer is `external-dns`, a controller that watches Ingress resources and writes the matching Route53 record itself. It's not part of this project — not because it's a bad tool, but because it's a *second* cluster controller with its own IAM policy, to automate a handful of DNS records total across this project's entire lifetime. `scripts/update-dns.sh` handles it instead: a plain idempotent `UPSERT`, given the current ALB hostname as an argument every time (not hand-typed from a doc), so there's no way for a stale hostname from an earlier session to silently linger in Route53.

## Why the AWS Load Balancer Controller uses IRSA

The controller needs real AWS permissions (create ALBs, target groups, listeners) to do its job. IRSA (IAM Roles for Service Accounts) is the correct way to grant that: a role scoped to just this controller's ServiceAccount, via OIDC federation between EKS and IAM — not the node's own, much broader IAM role, which every pod on the node would otherwise share.

Two things have to both be true for IRSA to actually work, and it's worth naming both explicitly because a partially-correct IRSA setup fails silently rather than loudly:

1. **The IAM role's trust policy and permissions must be entirely Terraform-managed.** `modules/eks/irsa.tf` creates the role and attaches the official AWS Load Balancer Controller policy (`alb-controller-iam-policy.json`, committed in this repo) as an inline policy — not a reference to a policy ARN that has to be created by hand outside of Terraform first. A role that depends on a manually pre-created resource works on the machine where someone remembered to create that resource, and fails with `NoSuchEntity` everywhere else, including a fresh clone of this exact repo.
2. **The ServiceAccount the controller's pod actually runs as must be annotated with that role's ARN**, via `eks.amazonaws.com/role-arn`. Terraform creating a perfectly correct IRSA role has no effect at all on the running pod until this annotation exists — `scripts/install-cluster-addons.sh` sets it explicitly on the Helm install (`serviceAccount.annotations`), reading the role ARN fresh from `terraform output` every time, and then verifies the annotation actually landed before moving on rather than assuming it did.

Note what's *not* here: there's no fallback IAM policy on the node role for the ALB Controller. That's deliberate — a fallback would mean a broken IRSA setup (wrong policy, missing annotation, whatever) keeps working anyway via the node's permissions, and you'd never find out IRSA was misconfigured until you removed the fallback. With only IRSA granting these permissions, a misconfiguration fails immediately and loudly (`AccessDenied` in the controller's logs), which is what you want while this pattern is still new.

## Why secrets are a Terraform-created Kubernetes Secret, not External Secrets Operator

The app needs exactly two things at runtime: RDS credentials and a JWT signing secret. Terraform already generates both in the same `apply` that creates the database — so it writes them straight into a Kubernetes Secret via the `kubernetes` provider, in the same run. The Helm chart references that Secret by name; it never creates one or contains a plaintext value, so nothing sensitive is ever committed to Git. The trade-off against External Secrets Operator: no secret **rotation** without a `terraform apply` — a real capability a larger team would want, and also a whole extra controller to explain for a project with exactly two secrets per environment.

## What was left out, and why

| Left out | Why | Natural next step |
|---|---|---|
| A third environment (qa/staging) | Near-duplicate of prod's config, no new concept | Add one once there's a real need for a pre-prod integration environment |
| `external-dns` | A second cluster controller + IAM policy to automate a handful of DNS records total | Worth it once hostnames change often enough that the manual step (now scripted — see `update-dns.sh`) becomes real toil |
| Centralized logging (Loki/ELK/CloudWatch Logs Insights) | Adds a second observability axis (logs, on top of metrics) for a project where `kubectl logs` and Docker Compose's own log output already answer "what happened" at this scale | Worth adding once there are enough pods/replicas that grepping individual pod logs stops being practical |
| Custom ArgoCD AppProject | RBAC/scoping for multiple teams sharing one ArgoCD — meaningless for one person, two environments | Needed once more than one person or team touches the cluster |
| NetworkPolicy | Requires CNI-level pod-to-pod traffic control | A strong "what would you add next" interview answer |
| PodDisruptionBudget | Cheap to add, but "voluntary disruption during node drains" is a level past this project's scope | Same |
| WAF | Real per-rule cost, and rule-tuning is its own specialty | `aws_wafv2_web_acl` attached via the Ingress's annotation |
| SonarQube | Needs a running server; `npm audit` + Dependabot + Gitleaks already cover the security-relevant part for a Node.js stack | Add SonarCloud if you specifically want code-quality metrics |
| Customer-managed KMS keys | AWS's default managed keys give the same "encrypted at rest" guarantee with one less ARN to track | Needed for a specific compliance requirement around key ownership |

## Interview questions this project should let you answer confidently

- Walk me through what happens from `git push` to the app being live.
- Why three repos instead of one? Why not four or five?
- Why does the Helm chart live in the app repo but the values live in the GitOps repo? What does ArgoCD need to do differently because of that?
- Why Terraform *and* Ansible — why not just one?
- What's the difference between how dev and prod get deployed?
- How does GitHub Actions authenticate to AWS without a stored access key?
- If the backend pod is crash-looping, how would you debug it — from `kubectl get pods` to a root cause?
- What happens if you push to `develop` while Jenkins *and* GitHub Actions are both watching the repo?
- Where does the JWT secret come from, and who/what can read it?
- What two separate things both have to be true for IRSA to actually work, and how would you check each one from the command line?
- If prod goes down right now, what's your first command?
- What's one thing you'd add to this project if you had another month, and why didn't you add it already?

## Lessons learned building this

- **Chart/values split has a real mechanical cost.** Splitting "what to deploy" from "what values to deploy it with" across repos sounds clean in a diagram, but it means ArgoCD's single-source model no longer works — multi-source Applications are the correct answer, but they're genuinely more to explain than a single `repoURL`. Worth doing for the reason (chart changes belong with code changes), but it's not free.
- **Naming things consistently across 3 repos and ~10 tools is harder than it looks.** A Kubernetes namespace name, a Terraform local, an ArgoCD release name, and a verification script's variable all have to agree exactly, or something breaks silently instead of loudly. Renaming this project once (from an earlier, more generically-named version) surfaced several of these hidden couplings — the Prometheus alert rule referencing a `job` label, a Grafana panel querying a job name that no longer existed after a rename.
- **IRSA has two independent parts, and it's not obviously broken when only one of them is wrong.** The IAM role/policy side (Terraform) and the ServiceAccount annotation side (the Helm install) are separate steps in separate tools — get the policy right but forget the annotation (or vice versa) and the controller doesn't error out, it just quietly uses whatever fallback credentials are available and keeps working, right up until that fallback isn't there anymore. The fix wasn't just "add IRSA" — it was removing every fallback once IRSA was actually correct, specifically so a future mistake here fails loudly instead of silently.
- **A hardcoded ARN (an IAM policy, a certificate) is a ticking time bomb, not a working shortcut.** It works exactly once, on exactly the machine/account where it was copied from, and fails — confusingly — the moment anyone else clones the repo or the underlying resource gets recreated. If a value comes from `terraform output`, it needs to be read fresh from `terraform output` every time it's used, not pasted into a file once.
- **A local-only monitoring stack (no in-cluster Prometheus/Grafana) is a legitimate scope boundary**, not a missing feature — it's worth being able to say precisely what "production-inspired but not production" means for this specific project, rather than being vague about it.
