#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${ROOT_DIR}/tmp/gst140"
INPUT_JSON="${1:-${ROOT_DIR}/tmp/gst140-hourly-input.json}"
NOW_ISO="${2:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
RECORD_PATH="${ROOT_DIR}/docs/GST-140-hourly-comment-records.jsonl"

mkdir -p "${TMP_DIR}"

if [[ ! -f "${INPUT_JSON}" ]]; then
  echo "missing input json: ${INPUT_JSON}" >&2
  exit 1
fi

ARTIFACT_JSON="${TMP_DIR}/artifact-${NOW_ISO//:/-}.json"
POST_MD="${TMP_DIR}/post-${NOW_ISO//:/-}.md"

node "${ROOT_DIR}/scripts/generate-gst140-hourly-post.js" \
  --input "${INPUT_JSON}" \
  --output "${POST_MD}" \
  --now "${NOW_ISO}" \
  > "${ARTIFACT_JSON}"

node "${ROOT_DIR}/scripts/update-gst140-comment-records.js" \
  --artifact "${ARTIFACT_JSON}" \
  --record "${RECORD_PATH}" \
  > /dev/null

node "${ROOT_DIR}/scripts/critical-high-ledger-check.js" \
  --record "${RECORD_PATH}"

echo "cycle_done artifact=${ARTIFACT_JSON} post=${POST_MD} record=${RECORD_PATH}"
