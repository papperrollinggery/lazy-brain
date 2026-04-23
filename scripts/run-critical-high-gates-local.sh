#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORD_PATH="${ROOT_DIR}/docs/GST-140-hourly-comment-records.jsonl"

node "${ROOT_DIR}/scripts/verify-rollup-optional.js"
node "${ROOT_DIR}/scripts/critical-high-ledger-check.js" --record "${RECORD_PATH}"
node "${ROOT_DIR}/scripts/verify-gst140-hourly-compliance.js" --record "${RECORD_PATH}" --maxGapMinutes 65

echo "critical_high_gates=PASS"
