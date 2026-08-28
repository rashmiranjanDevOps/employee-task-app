# Employee Task Tracker — App Repository

This is a task management web app. Employees can sign up, log in, and manage tasks. They can create tasks, assign them, track their status, and filter them.

I built this project to practice real DevOps work. Not just the app code — everything around it too. That means containers, CI/CD, Kubernetes, and monitoring.

**Live app:** https://rashmidevops.xyz

## Part of a 3-repo project

I split this project into 3 repos on purpose. Each repo has one clear job. A real team would split the work this way too — app code, infrastructure, and deployment config all kept separate.

| Repo | What it does |
|---|---|
| **employee-task-app** (this one) | The app code, the Helm chart, and both CI/CD pipelines |
| [employee-task-infra](https://github.com/rashmiranjanDevOps/employee-task-infra.git) | Terraform. Builds all the AWS infrastructure. |
| [employee-task-gitops](https://github.com/rashmiranjanDevOps/employee-task-gitops.git) | The ArgoCD file that tells Kubernetes what to run |

## How it all connects

1. I push code to `main` on GitHub.
2. CI runs. It lints the code, runs tests, scans for secrets, builds Docker images, scans those images for security problems with Trivy, then pushes them to AWS ECR.
3. CI then updates the image tag in this repo's Helm chart and commits that change.
4. ArgoCD is running inside the cluster. It sees the change and deploys the new version automatically.
5. Prometheus collects metrics from the backend. Grafana shows them on a dashboard. Alertmanager sends alerts to Slack if something is wrong.

## Folder structure

```
backend/              Node.js + Express API — auth, tasks, users, audit log
frontend/             React app, built with Vite
helm/employee-task/   The Helm chart — templates and default values, one place
docker/               docker-compose.yml, for running everything on your own machine
monitoring/           Prometheus, Grafana, and Alertmanager config
scripts/
  ci/                 Scripts both pipelines call — test, build, scan, push
  rollback.sh         Undoes a bad deploy
  verify-deployment.sh  Checks a deploy actually worked
  notify-slack.sh     Sends CI and deploy messages to Slack
.github/workflows/    CI/CD pipeline #1 — GitHub Actions
Jenkinsfile            CI/CD pipeline #2 — Jenkins
```

## Why two CI/CD pipelines?

I kept both GitHub Actions and Jenkins on purpose. This is for practice, so I understand both tools well. The project itself doesn't need two pipelines.

Day to day, I only run one pipeline at a time — the Jenkinsfile and the GitHub Actions file both have a comment about this. Both pipelines call the same scripts in `scripts/ci/`. So they do the same job, the same way. Nothing is duplicated in logic. Only the tool that triggers it is different.

## Tech stack

- **Backend:** Node.js, Express, Sequelize (talks to MySQL), JWT for login
- **Frontend:** React, Vite, Tailwind CSS
- **Containers:** Docker, Docker Compose (for local use)
- **CI/CD:** GitHub Actions and Jenkins — same scripts, either one works
- **Security scans:** Trivy (container images), Gitleaks (secrets in code), npm audit
- **Deployment:** Helm chart, ArgoCD (GitOps)
- **Monitoring:** Prometheus, Grafana, Alertmanager, Slack alerts

## Running it on your own machine

```bash
git clone https://github.com/rashmiranjanDevOps/employee-task-app.git
cd employee-task-app

cp docker/.env.example docker/.env
cp backend/.env.development.example backend/.env.development
# open both files and fill in a DB password and a JWT secret

cd docker
docker compose up --build
```

Once it's running:
- App frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090

For the full AWS setup, across all 3 repos, see [SETUP.md](./SETUP.md). For an even more detailed, step-by-step version with a check after every step, see `employee-task-infra`'s [SETUP-FULL.md](https://github.com/rashmiranjanDevOps/employee-task-infra/blob/main/SETUP-FULL.md).

## How a deploy works

I don't deploy by hand. I push to `main`, and CI does the rest. It builds, tests, scans, pushes the image, and updates the image tag in the Helm chart. ArgoCD then rolls it out to the cluster on its own, usually within a few minutes.

## Rolling back a bad deploy

```bash
./scripts/rollback.sh
```

This reverts the Helm chart's `values.yaml` to the previous Git commit. Then it lets ArgoCD sync to that older version.

I do it this way, and not with `argocd app rollback`, because I want Git to stay the one true record of what's deployed. If I only rolled back inside ArgoCD, the next auto-sync would just undo it and put the bad version back.

## What this costs to run

This is a small, single-environment setup. It's not a production cluster, so I kept AWS costs low on purpose:
- One EKS cluster with one small worker node (t3.medium)
- One NAT Gateway shared by both subnets, instead of one per zone. This is cheaper. The trade-off: if that NAT's zone has an outage, both private subnets lose internet access. For a learning project, this is an acceptable trade-off.
- One small RDS database (db.t3.micro), with 1-day backup retention, no Multi-AZ
- No extra AWS KMS key for encryption. RDS and EKS already encrypt data with AWS's own default key, so I didn't add a second key to manage.

Total cost is roughly **$60–90 a month** while it's running. I tear it down with Terraform when I'm not actively working on it, so I don't pay for infrastructure I'm not using.

## Troubleshooting

Common problems across all 3 repos, and the command to check each one: see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Tearing everything down

The full steps, in the right order, are in [SETUP.md](./SETUP.md#tearing-it-all-down). For a more detailed teardown with a safety check after each step, see `employee-task-infra`'s [DESTROY.md](https://github.com/rashmiranjanDevOps/employee-task-infra/blob/main/DESTROY.md).

## Scope of this project

This is a portfolio project. It runs one environment (dev), one domain, and one small cluster. I built it this way so I could understand every part of it end to end — not to copy a large company's production setup.
