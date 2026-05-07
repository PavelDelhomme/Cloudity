#!/bin/sh
# Envoie un run de pipeline vers l'API admin (persisté si migration 33 appliquée).
# Exemples :
#   CLOUDITY_GATEWAY_URL=http://127.0.0.1:6080 \
#   CLOUDITY_PERF_INGEST_TOKEN=... \
#   ./scripts/ci/report-pipeline-run.sh make_test 1 12500 "ci-123"
#
# Arguments : <pipeline_kind> <success 0|1> <duration_ms> [run_id]
set -e
export KIND="${1:-unknown_pipeline}"
SUCCESS_RAW="${2:-1}"
export DURATION_MS="${3:-0}"
export RUN_ID="${4:-}"

case "$SUCCESS_RAW" in
  1|true|yes|ok) export SUCCESS_JSON=true ;;
  *) export SUCCESS_JSON=false ;;
esac

BASE="${CLOUDITY_GATEWAY_URL:-http://127.0.0.1:6080}"
URL="${BASE%/}/admin/performance/pipeline-run"

HDR_AUTH=""
if [ -n "${CLOUDITY_PERF_INGEST_TOKEN:-}" ]; then
  HDR_AUTH="-H X-Cloudity-Perf-Ingest: ${CLOUDITY_PERF_INGEST_TOKEN}"
fi

BODY=$(python3 -c "
import json, os
d = {
  'pipeline_kind': os.environ['KIND'],
  'success': os.environ['SUCCESS_JSON'] == 'true',
  'duration_ms': int(os.environ['DURATION_MS']),
}
rid = os.environ.get('RUN_ID', '').strip()
if rid:
  d['run_id'] = rid
print(json.dumps(d))
")

# shellcheck disable=SC2086
curl -sfS -X POST "$URL" $HDR_AUTH \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo ""
