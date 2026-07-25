#!/usr/bin/env bash
# verify-deployment.sh — smoke-tests a live deployment after ArgoCD reports
# Healthy/Synced. ArgoCD's sync status only means "the cluster matches Git" —
# it says nothing about whether the app actually serves traffic correctly
# (crashlooping pods behind a Service can still show as "Synced"). Run this
# after every deploy, or wire it into CI as a post-deploy gate.
#
# Usage:
#   ./verify-deployment.sh <dev|prod> <expected-backend-tag>
#
# Exit code 0 = healthy and running the expected version.
# Exit code 1 = verification failed.

set -uo pipefail   # deliberately NOT -e: run every check and report all
                    # failures, not stop at the first one.

ENVIRONMENT="${1:?Usage: $0 <dev|prod> <expected-backend-tag>}"
EXPECTED_TAG="${2:?Usage: $0 <dev|prod> <expected-backend-tag>}"

case "${ENVIRONMENT}" in
  dev)  BACKEND_HOST="dev-api.rashmidevops.xyz" ;;
  prod) BACKEND_HOST="api.rashmidevops.xyz" ;;
  *) echo "ERROR: unknown environment '${ENVIRONMENT}' (expected dev or prod)" >&2; exit 1 ;;
esac

NAMESPACE="employee-task-${ENVIRONMENT}"
RELEASE="employee-task-${ENVIRONMENT}"
MAX_ATTEMPTS=20
SLEEP_SECONDS=15
FAILED=0

echo "==> Verifying ${ENVIRONMENT} (namespace=${NAMESPACE}, expecting backend tag=${EXPECTED_TAG})"

# --- 1. Rollout status: every pod actually Ready, not just "created" ---
echo "--> Checking rollout status..."
if ! kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-backend --timeout=180s; then
  echo "FAIL: backend rollout did not complete"
  FAILED=1
fi
if ! kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-frontend --timeout=180s; then
  echo "FAIL: frontend rollout did not complete"
  FAILED=1
fi

# --- 2. No pods in CrashLoopBackOff / ImagePullBackOff right now ---
echo "--> Checking for unhealthy pods..."
BAD_PODS="$(kubectl -n "${NAMESPACE}" get pods \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{" "}{.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}' \
  | grep -E 'CrashLoopBackOff|ImagePullBackOff|ErrImagePull' || true)"
if [[ -n "${BAD_PODS}" ]]; then
  echo "FAIL: unhealthy pods found:"
  echo "${BAD_PODS}"
  FAILED=1
fi

# --- 3. HTTP health check through the real ingress (proves ALB + TLS +
#        Service + Pod are ALL correctly wired, not just the pods) ---
echo "--> Checking https://${BACKEND_HOST}/health ..."
attempt=0
health_ok=0
while [[ ${attempt} -lt ${MAX_ATTEMPTS} ]]; do
  attempt=$((attempt + 1))
  http_code="$(curl -s -o /tmp/health-response.json -w '%{http_code}' --max-time 10 "https://${BACKEND_HOST}/health" || echo "000")"
  if [[ "${http_code}" == "200" ]]; then
    health_ok=1
    break
  fi
  echo "    attempt ${attempt}/${MAX_ATTEMPTS}: HTTP ${http_code}, retrying in ${SLEEP_SECONDS}s..."
  sleep "${SLEEP_SECONDS}"
done

if [[ "${health_ok}" -ne 1 ]]; then
  echo "FAIL: /health never returned 200 after ${MAX_ATTEMPTS} attempts"
  FAILED=1
else
  # --- 4. Version match: confirms traffic is actually hitting the NEW
  #        pods, not stale ones behind a Service that didn't roll ---
  DEPLOYED_VERSION="$(jq -r '.version // empty' /tmp/health-response.json 2>/dev/null || true)"
  if [[ -n "${DEPLOYED_VERSION}" && "${DEPLOYED_VERSION}" != "${EXPECTED_TAG}" ]]; then
    echo "FAIL: /health reports version '${DEPLOYED_VERSION}', expected '${EXPECTED_TAG}'"
    FAILED=1
  else
    echo "OK: /health returned 200, version matches (${DEPLOYED_VERSION:-not exposed by /health, skipped})"
  fi
fi

if [[ "${FAILED}" -eq 1 ]]; then
  echo "==> VERIFICATION FAILED for ${ENVIRONMENT}"
  exit 1
fi

echo "==> VERIFICATION PASSED for ${ENVIRONMENT}"
exit 0
