# Employee Task Tracker — Application Repository

A full-stack task management app, built to demonstrate the complete DevOps lifecycle for **one real application**, end to end: containerized app → Terraform+Ansible-provisioned AWS infrastructure → GitOps-managed Kubernetes deployment → CI/CD → monitoring.

**Live:** `https://app.rashmidevops.xyz` (prod) · `https://dev-app.rashmidevops.xyz` (dev)

**Can this candidate provision infrastructure, automate deployments, deploy applications to Kubernetes, and monitor production workloads?** That's the question this project (and its two sibling repos) is built to answer — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full reasoning behind every decision.

## Project overview

Employees can sign up, log in, and manage tasks (create, assign, track status, filter by priority) through a JWT-authenticated REST API and a React SPA. That's the whole product — deliberately simple, so the DevOps lifecycle around it is what does the talking.

This is one of **3 repos**, each with a single clear responsibility:

| Repo | Owns |
|---|---|
| **employee-task-app** (this repo) | Application source, the Helm **chart**, CI/CD pipelines, local dev stack, docs |
| [employee-task-gitops](https://github.com/rashmiranjandevops/employee-task-gitops) | Helm **values** and ArgoCD Applications — what's actually deployed |
| [employee-task-infra](https://github.com/rashmiranjandevops/employee-task-infra) | Terraform + Ansible — everything CI/CD and GitOps run on top of |

## Architecture diagram

```
employee-task-infra                        employee-task-app                    employee-task-gitops
  Terraform: VPC, EKS, RDS,             backend/, frontend/              environments/dev/values.yaml
  ECR, ACM, Route53 lookup,             helm/employee-task/ (the chart)  environments/prod/values.yaml
  GitHub OIDC role, Jenkins EC2         .github/workflows/ci-cd.yml
  Ansible: configures that EC2          Jenkinsfile
        |                                     |
        |                              push to develop/main
        |                                     v
        |                              GitHub Actions OR Jenkins
        |                              checks -> secret scan -> build
        |                              -> scan image -> push to ECR  ---> updates image.tag,
        |                                                                  pushes, notifies Slack
        v                                                                  |
  EKS cluster (dev or prod)                                                v
  backend + frontend pods  <----------------------------------  ArgoCD (multi-source: chart from
  |            |                                                  employee-task-app + values from
  v            v                                                  employee-task-gitops)
RDS MySQL   ALB + DNS (manual)
                    |
                    v
     Prometheus -> Grafana -> Alertmanager -> Slack
```

Full reasoning behind every box and arrow: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Folder structure

```
backend/            Express API — JWT auth, tasks, users, audit log, tests
frontend/            React SPA (Vite)
helm/employee-task/  The Helm CHART (templates + default values.yaml)
docker/              docker-compose.yml for local development
monitoring/          Prometheus / Grafana / Alertmanager config
scripts/
  ci/                Shared build/test/deploy logic — called by BOTH pipelines
  rollback.sh, verify-deployment.sh, notify-slack.sh
.github/workflows/   CI/CD pipeline (GitHub Actions)
Jenkinsfile          CI/CD pipeline (Jenkins) — functionally equivalent
runbook/             Copy-paste guides: PREREQUISITES, EXECUTION-GUIDE, DESTROY-GUIDE
```

## Technology stack

React · Node.js/Express · MySQL · Docker · Docker Compose · Terraform · Ansible · AWS (VPC, EKS, RDS, ECR, IAM, Route53, ACM, EC2) · GitHub Actions · Jenkins · Kubernetes · Helm · ArgoCD · Prometheus · Grafana · Alertmanager · Slack

## Setup instructions (quick start — local only)

```bash
git clone https://github.com/rashmiranjandevops/employee-task-app.git
cd employee-task-app

cp docker/.env.example docker/.env                                # fill in DB/Grafana passwords
cp backend/.env.development.example backend/.env.development       # fill in a JWT secret

cd docker
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090

For the full AWS deployment (all 3 repos, in order): [runbook/PREREQUISITES.md](./runbook/PREREQUISITES.md) → [runbook/EXECUTION-GUIDE.md](./runbook/EXECUTION-GUIDE.md). For the reasoning behind each step rather than just the commands: [INSTALL.md](./INSTALL.md).

## Deployment instructions

Push to `develop` → dev deploys automatically. Push to `main` → prod image is built, but requires a deliberate `argocd app sync` to actually roll out. Full day-to-day flow: [EXECUTION.md](./EXECUTION.md).

## Rollback procedure

```bash
./scripts/rollback.sh prod ../employee-task-gitops
```
Reverts the environment's values file to its previous Git commit and syncs ArgoCD to that — a Git revert, not `argocd app rollback` (see [ARCHITECTURE.md](./ARCHITECTURE.md) for why that distinction matters). Full detail: [EXECUTION.md](./EXECUTION.md#rolling-back-a-bad-deploy).

## Troubleshooting guide

Common failures across Terraform, Ansible, Kubernetes, Ingress/DNS, ArgoCD, both CI/CD pipelines, and monitoring, each with the actual command to run: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Full teardown

Reverse-order, step-by-step, with a cost-leak checklist at the end: [DESTROY.md](./DESTROY.md), or the copy-paste version: [runbook/DESTROY-GUIDE.md](./runbook/DESTROY-GUIDE.md).

## Screenshots

_Add screenshots here once deployed: the Grafana dashboard, the ArgoCD UI showing both Applications synced, the running app, and a GitHub Actions run. These are the images a recruiter actually looks at first — worth prioritizing over more written docs._

## Interview questions & lessons learned

Both are in [ARCHITECTURE.md](./ARCHITECTURE.md#interview-questions-this-project-should-let-you-answer-confidently) — kept there rather than here because they're really "architecture reasoning, phrased as questions," and belong next to the trade-off explanations they're testing.

## Documentation index

| Doc | Covers |
|---|---|
| [INSTALL.md](./INSTALL.md) | Setup instructions, with the *why* behind each step |
| [EXECUTION.md](./EXECUTION.md) | Day-to-day deployment + rollback |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, trade-offs, interview questions, lessons learned |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common failures and fixes |
| [DESTROY.md](./DESTROY.md) | Safe teardown |
| [runbook/](./runbook/) | Copy-paste versions of the above three, no prose |

## Scope

This project runs two environments (dev, prod) and skips some patterns you'd see in a larger team's setup (IRSA, a custom ArgoCD project, NetworkPolicies, `external-dns`, centralized logging). See [ARCHITECTURE.md](./ARCHITECTURE.md#what-was-left-out-and-why) for exactly what was left out and why.
