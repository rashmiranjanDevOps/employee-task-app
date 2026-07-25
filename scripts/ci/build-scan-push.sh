#!/usr/bin/env bash
# build-scan-push.sh — builds the backend + frontend images, scans both with
# Trivy, and pushes both to ECR. Called identically from both pipelines
# after they've each authenticated to AWS in their own platform-specific
# way (GitHub Actions: OIDC; Jenkins: stored credentials + `docker login`) —
# that auth step is the only thing that differs between the two.
#
# Usage: ./build-scan-push.sh <ecr-registry> <image-tag>
# Example: ./build-scan-push.sh 123456789012.dkr.ecr.us-east-1.amazonaws.com dev-a1b2c3d

set -euo pipefail

ECR_REGISTRY="${1:?Usage: $0 <ecr-registry> <image-tag>}"
IMAGE_TAG="${2:?Usage: $0 <ecr-registry> <image-tag>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BACKEND_IMAGE="${ECR_REGISTRY}/employee-task-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_REGISTRY}/employee-task-frontend:${IMAGE_TAG}"

echo "==> Building backend image: ${BACKEND_IMAGE}"
docker build --target production -t "${BACKEND_IMAGE}" "${REPO_ROOT}/backend"

echo "==> Building frontend image: ${FRONTEND_IMAGE}"
docker build --target production -t "${FRONTEND_IMAGE}" "${REPO_ROOT}/frontend"

# Fails the pipeline on HIGH/CRITICAL vulnerabilities in either image —
# scanning after build but before push means a vulnerable image never
# reaches ECR at all.
echo "==> Scanning backend image (Trivy)"
trivy image --severity HIGH,CRITICAL --exit-code 1 "${BACKEND_IMAGE}"

echo "==> Scanning frontend image (Trivy)"
trivy image --severity HIGH,CRITICAL --exit-code 1 "${FRONTEND_IMAGE}"

echo "==> Pushing images to ECR"
docker push "${BACKEND_IMAGE}"
docker push "${FRONTEND_IMAGE}"

echo "==> Done. Pushed:"
echo "    ${BACKEND_IMAGE}"
echo "    ${FRONTEND_IMAGE}"
