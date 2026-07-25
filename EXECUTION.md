# EXECUTION.md

Day-to-day workflows, once [INSTALL.md](./INSTALL.md) has been done once.

## Making a code change and deploying to dev

```
1. Branch off develop, make your change
2. Open a PR into develop
   -> CI runs: checks (lint+test+audit) + secret scan. No AWS access on a PR.
3. Merge to develop
   -> CI runs the full pipeline: checks, build, image scan, push to ECR as
      dev-<short-sha>, update employee-task-gitops's environments/dev/values.yaml, notify Slack
   -> ArgoCD auto-syncs dev within ~3 minutes
4. Verify: ./scripts/verify-deployment.sh dev dev-<short-sha>
```

This happens identically whether GitHub Actions or Jenkins is your active pipeline — both call the same `scripts/ci/*.sh` scripts.

## Promoting dev to prod

There's no separate "promote" pipeline — prod runs from the same `main` branch, off the same Dockerfiles, the same way dev does.

```
1. Open a PR from develop into main (this is the promotion — review it like
   any other PR: what changed since the last prod release?)
2. Merge to main
   -> CI builds a FRESH image tagged prod-<short-sha> (not a retag of the
      dev image — see ARCHITECTURE.md for why)
   -> updates employee-task-gitops's environments/prod/values.yaml, notifies Slack
   -> ArgoCD shows employee-task-prod as OutOfSync (no auto-sync in prod)
3. Deliberately promote:
   argocd app sync employee-task-prod
   argocd app wait employee-task-prod --health --timeout 300
4. Verify: ./scripts/verify-deployment.sh prod prod-<short-sha>
```

## Using GitHub Actions vs. Jenkins

Both are complete pipelines. Switch which one is "live" by enabling/disabling its trigger — no code or architecture changes needed either way:

- **GitHub Actions**: triggers automatically on push once the repo is on GitHub.
- **Jenkins**: needs a webhook or SCM polling configured on the Jenkins job pointing at this repo — see employee-task-infra's `ansible/README.md` for how Jenkins itself gets set up.

Only enable one at a time — see [ARCHITECTURE.md](./ARCHITECTURE.md#why-two-ci-cd-pipelines-share-scripts) for why running both against the same push would race.

## Running locally without touching AWS at all

```bash
cd docker
docker compose up --build
```

Uses the same Dockerfiles as CI, against a local MySQL container instead of RDS. See the Quick Start in [README.md](./README.md).

## Changing infrastructure

```bash
cd ../employee-task-infra/terraform
terraform init -backend-config=environments/dev/backend.hcl
terraform plan -var-file=environments/dev/terraform.tfvars    # review before applying
terraform apply -var-file=environments/dev/terraform.tfvars
```

Apply to dev first, confirm nothing broke, then repeat against `environments/prod`. Changes to `terraform/global` (ECR, ACM, Jenkins) are rare — they affect both environments (and Jenkins) at once. If a global change produces new outputs, re-run `sync-config.sh` to propagate them.

## Changing what's on the Jenkins server itself

```bash
cd employee-task-infra/ansible
ansible-playbook jenkins.yml
```

Re-running the playbook is safe — it only changes what's actually different from the desired state (a new package version pinned in `jenkins.yml`, for example).

## Changing Kubernetes resources (replica counts, resource limits, env vars, hostnames)

Almost never edit `helm/employee-task/templates/*.yaml` (in this repo) directly for a routine change — edit `environments/dev/values.yaml` or `environments/prod/values.yaml` in employee-task-gitops instead, commit, push. ArgoCD (auto for dev, manual-sync for prod) applies it.

## Rolling back a bad deploy

```bash
./scripts/rollback.sh prod ../employee-task-gitops
```

This reverts `environments/prod/values.yaml` to its previous Git commit and syncs ArgoCD to it — see the script's comments (and ARCHITECTURE.md) for why this is a Git revert, not `argocd app rollback`.
