#!/usr/bin/env bash
# deploy-to-gitops.sh — bumps the image tag and pushes the commit that
# ArgoCD will pick up. This is the ONE script that actually changes what's
# deployed — called by both pipelines' final stage/job, so "how a deploy
# happens" is defined once, not twice.
#
# Expects the GitOps repo to already be checked out with push access
# configured (a PAT-authenticated remote in GitHub Actions, an SSH deploy
# key in Jenkins — see .github/workflows/ci-cd.yml and Jenkinsfile for how
# each sets that up before calling this).
#
# Usage:
#   ./deploy-to-gitops.sh <gitops-repo-path> <environment> <image-tag>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITOPS_PATH="${1:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"
ENVIRONMENT="${2:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"
IMAGE_TAG="${3:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"

"${SCRIPT_DIR}/update-image-tag.sh" "${GITOPS_PATH}" "${ENVIRONMENT}" "${IMAGE_TAG}"

cd "${GITOPS_PATH}"
git config user.name "employee-task-ci"
git config user.email "ci@rashmidevops.xyz"
git add "environments/${ENVIRONMENT}/values.yaml"

if git diff --cached --quiet; then
  echo "==> Nothing to commit (image tag unchanged) — skipping push"
  exit 0
fi

git commit -m "deploy(${ENVIRONMENT}): ${IMAGE_TAG}"
git push origin HEAD

echo "==> Pushed deploy commit for ${ENVIRONMENT} — ArgoCD will pick it up next"
