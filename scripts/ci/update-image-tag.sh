#!/usr/bin/env bash
# update-image-tag.sh — bumps backend + frontend image tags in the GitOps
# repo's per-environment values file. Called by deploy-to-gitops.sh.
#
# Requires yq (https://github.com/mikefarah/yq) — pre-installed on
# GitHub-hosted Ubuntu runners; installed directly on the Jenkins host by
# employee-task-infra/ansible/jenkins.yml.
#
# Usage:
#   ./update-image-tag.sh <gitops-repo-path> <environment> <image-tag>

set -euo pipefail

GITOPS_PATH="${1:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"
ENVIRONMENT="${2:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"
IMAGE_TAG="${3:?Usage: $0 <gitops-repo-path> <environment> <image-tag>}"

VALUES_FILE="${GITOPS_PATH}/environments/${ENVIRONMENT}/values.yaml"

if [[ ! -f "${VALUES_FILE}" ]]; then
  echo "ERROR: ${VALUES_FILE} does not exist" >&2
  exit 1
fi

echo "==> Setting image tag to '${IMAGE_TAG}' in ${VALUES_FILE}"

yq -i ".backend.image.tag = \"${IMAGE_TAG}\"" "${VALUES_FILE}"
yq -i ".frontend.image.tag = \"${IMAGE_TAG}\"" "${VALUES_FILE}"

echo "==> Done."
