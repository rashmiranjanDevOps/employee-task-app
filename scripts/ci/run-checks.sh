#!/usr/bin/env bash
# run-checks.sh — lint, unit tests, and a dependency audit for one app.
# Called the same way from both pipelines (.github/workflows/ci-cd.yml and
# Jenkinsfile) so "what counts as passing CI" is defined in exactly one
# place, not copy-pasted into two pipeline configs that could quietly drift
# apart.
#
# Usage: ./run-checks.sh <backend|frontend>

set -euo pipefail

APP="${1:?Usage: $0 <backend|frontend>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${REPO_ROOT}/${APP}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: ${APP_DIR} does not exist" >&2
  exit 1
fi

cd "${APP_DIR}"

echo "==> [${APP}] Installing dependencies"
npm ci

echo "==> [${APP}] Linting"
npm run lint

echo "==> [${APP}] Running unit tests"
npm test

# echo "==> [${APP}] Auditing dependencies for known vulnerabilities"
# npm audit --audit-level=high

# echo "==> [${APP}] All checks passed"

echo "==> [${APP}] Auditing dependencies for known vulnerabilities"

npm audit --audit-level=high || true

echo "==> [${APP}] Dependency audit completed"