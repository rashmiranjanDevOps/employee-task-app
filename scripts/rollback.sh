#!/usr/bin/env bash
# rollback.sh — reverts a bad deploy by moving the GitOps repo's
# per-environment values file back to its previous commit and letting
# ArgoCD sync THAT — not `argocd app rollback` against ArgoCD's internal
# history. Reverting in Git keeps Git the single source of truth (an
# `argocd app rollback` changes the live cluster without changing what's in
# Git, so the very next auto-sync would silently undo the rollback).
#
# Usage:
#   ./rollback.sh <dev|prod> <gitops-repo-path>
# Example:
#   ./rollback.sh prod ../employee-task-gitops

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <dev|prod> <gitops-repo-path>}"
GITOPS_PATH="${2:?Usage: $0 <dev|prod> <gitops-repo-path>}"
ARGOCD_APP="employee-task-${ENVIRONMENT}"
VALUES_FILE="environments/${ENVIRONMENT}/values.yaml"

echo "==> Rolling back ${ENVIRONMENT} (ArgoCD app: ${ARGOCD_APP})"

cd "${GITOPS_PATH}"

CURRENT_SHA="$(git rev-parse HEAD)"
PREVIOUS_SHA="$(git log -2 --format=%H -- "${VALUES_FILE}" | tail -n1)"

if [[ -z "${PREVIOUS_SHA}" || "${PREVIOUS_SHA}" == "${CURRENT_SHA}" ]]; then
  echo "ERROR: no previous commit touching ${VALUES_FILE} was found — nothing to roll back to." >&2
  echo "       This may be the first deploy ever made to ${ENVIRONMENT}; manual intervention required." >&2
  exit 1
fi

echo "--> Reverting ${VALUES_FILE} from ${CURRENT_SHA:0:8} to the version at ${PREVIOUS_SHA:0:8}"
git checkout "${PREVIOUS_SHA}" -- "${VALUES_FILE}"

if git diff --cached --quiet -- "${VALUES_FILE}" && git diff --quiet -- "${VALUES_FILE}"; then
  echo "ERROR: revert produced no changes — ${VALUES_FILE} was already at the previous version." >&2
  exit 1
fi

git add "${VALUES_FILE}"
git commit -m "rollback(${ENVIRONMENT}): revert to $(git rev-parse --short "${PREVIOUS_SHA}") after a failed deployment"
git push origin HEAD

echo "--> Waiting for ArgoCD to sync the reverted state..."
argocd app sync "${ARGOCD_APP}" --prune
argocd app wait "${ARGOCD_APP}" --health --timeout 300

echo "==> Rollback complete. Run verify-deployment.sh ${ENVIRONMENT} to confirm."
