#!/usr/bin/env bash
# notify-slack.sh — posts a simple message to Slack via an incoming
# webhook. Called from both pipelines at the same 4 points: CI success, CI
# failure, deploy success, deploy failure.
#
# Reads the webhook URL from $SLACK_WEBHOOK_URL (a GitHub Actions secret /
# Jenkins credential — never hardcoded here). If it's unset, this script
# just logs and exits 0: a missing webhook shouldn't fail your pipeline.
#
# Usage:
#   ./notify-slack.sh <success|failure> <"CI"|"Deploy"> <environment-or-context> <details>
# Example:
#   ./notify-slack.sh success Deploy prod "image dev-a1b2c3d"
#   ./notify-slack.sh failure CI "" "lint failed on backend"

set -euo pipefail

STATUS="${1:?Usage: $0 <success|failure> <stage> <context> <details>}"
STAGE="${2:?Usage: $0 <success|failure> <stage> <context> <details>}"
CONTEXT="${3:-}"
DETAILS="${4:-}"

if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
  echo "SLACK_WEBHOOK_URL not set — skipping Slack notification (this is not a failure)"
  exit 0
fi

if [[ "${STATUS}" == "success" ]]; then
  EMOJI="✅"
else
  EMOJI="🚨"
fi

CONTEXT_SUFFIX=""
[[ -n "${CONTEXT}" ]] && CONTEXT_SUFFIX=" (${CONTEXT})"
TEXT="${EMOJI} *${STAGE} ${STATUS}*${CONTEXT_SUFFIX} — employee-task
${DETAILS}"

PAYLOAD="$(jq -n --arg text "${TEXT}" '{text: $text}')"

curl -sf -X POST "${SLACK_WEBHOOK_URL}" \
  -H 'Content-Type: application/json' \
  -d "${PAYLOAD}" \
  > /dev/null

echo "==> Slack notified: ${STAGE} ${STATUS}"
