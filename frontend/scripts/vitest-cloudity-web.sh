#!/bin/sh
# Vitest @cloudity/web — conteneur cloudity-web (/ws) ou local (ROOT_WS=frontend).
# Limites mémoire / workers : compatible exécution parallèle JobbingTrack sur la même machine.
#
# Usage :
#   ./scripts/vitest-cloudity-web.sh
#   ./scripts/vitest-cloudity-web.sh src/pages/app/mail/MailPage.test.tsx

set -eu

ROOT_WS="${ROOT_WS:-/ws}"
FILE="${1:-}"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
export CLOUDITY_VITEST_MAX_WORKERS="${CLOUDITY_VITEST_MAX_WORKERS:-1}"

cd "$ROOT_WS"
npm install --prefer-offline --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
cd apps/cloudity-web

REPORT_DIR="${CLOUDITY_TEST_LOGS_DIR:-}"
JSON_OUT=""
if [ -n "$REPORT_DIR" ]; then
  mkdir -p "$REPORT_DIR"
  JSON_OUT="$REPORT_DIR/vitest-results.json"
fi

run_vitest() {
  if [ -n "$JSON_OUT" ]; then
    env FORCE_COLOR=1 npx vitest run \
      --testTimeout=15000 \
      --pool=threads \
      --maxWorkers="$CLOUDITY_VITEST_MAX_WORKERS" \
      --fileParallelism=false \
      --reporter=verbose \
      --reporter=json \
      --outputFile="$JSON_OUT" \
      "$@"
    local code=$?
    if [ -f "$JSON_OUT" ]; then
      echo "  Rapport Vitest JSON : $JSON_OUT"
    fi
    return "$code"
  fi
  exec env FORCE_COLOR=1 npx vitest run \
    --testTimeout=15000 \
    --pool=threads \
    --maxWorkers="$CLOUDITY_VITEST_MAX_WORKERS" \
    --fileParallelism=false \
    --reporter=verbose \
    "$@"
}

if [ -n "$FILE" ]; then
  run_vitest "$FILE"
  exit $?
fi

run_vitest
exit $?
