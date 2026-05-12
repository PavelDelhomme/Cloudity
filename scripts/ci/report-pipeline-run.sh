#!/bin/sh
# Envoie un run de pipeline vers l'API admin (persisté si migration 33 appliquée).
# Exemples :
#   CLOUDITY_GATEWAY_URL=http://127.0.0.1:6080 \
#   CLOUDITY_DASHBOARD_ORIGIN=http://localhost:6001 \
#   CLOUDITY_ACCESS_TOKEN="<jwt admin>" \
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

ORIGIN="${CLOUDITY_DASHBOARD_ORIGIN:-http://localhost:6001}"

HDR_AUTH=""
if [ -n "${CLOUDITY_PERF_INGEST_TOKEN:-}" ]; then
  HDR_AUTH="-H X-Cloudity-Perf-Ingest:${CLOUDITY_PERF_INGEST_TOKEN}"
else
  echo "CLOUDITY_PERF_INGEST_TOKEN manquant (doit matcher PERFORMANCE_INGEST_TOKEN gateway+admin-service)" >&2
  exit 1
fi

HDR_JWT=""
TOKEN="${CLOUDITY_ACCESS_TOKEN:-${CLOUDITY_JWT:-}}"
if [ -z "$TOKEN" ]; then
  echo "CLOUDITY_ACCESS_TOKEN (ou CLOUDITY_JWT) manquant : la gateway exige un JWT admin + Origin pour POST /admin/performance/pipeline-run" >&2
  exit 1
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
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Origin: ${ORIGIN}" \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo ""
