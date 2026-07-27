#!/usr/bin/env bash
# make up-full — down + up + seed + (optionnel) tests unitaires.
#
# Variables :
#   UP_FULL_SKIP_TESTS=1   — ne pas lancer make test (équivalent rapide à up-ready après seed)
#
# Ctrl+C pendant les tests : nettoie les *-run-*, la stack long-running reste up.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MAKE="${MAKE:-make}"
HINT="$ROOT/scripts/dev/up-failure-hint.sh"
TESTS_STARTED=0

cleanup_interrupt() {
  if [ -x "$HINT" ]; then
    "$HINT" interrupt
  else
    echo ""
    echo "⚠️  Interruption (Ctrl+C).  Stack conservée — make status  ·  make down"
  fi
  if [ "$TESTS_STARTED" = "1" ]; then
    echo "   Nettoyage des conteneurs de test (*-run-*)…"
    "$ROOT/scripts/dev/prune-compose-runs.sh" || true
  fi
  exit 130
}

trap cleanup_interrupt INT TERM

_run_stack_phase() {
  local phase="$1"
  if ! "$MAKE" --no-print-directory "$phase"; then
    echo ""
    echo "❌ Échec : make $phase"
    chmod +x "$HINT" 2>/dev/null || true
    if [ -x "$HINT" ]; then
      "$HINT" stack
    fi
    exit 1
  fi
}

_run_stack_phase down
_run_stack_phase up
_run_stack_phase wait-for-services
_run_stack_phase seed
_run_stack_phase seed-admin

if [ "${UP_FULL_SKIP_TESTS:-0}" = "1" ]; then
  echo ""
  echo "✅ Stack + seed OK (tests ignorés — UP_FULL_SKIP_TESTS=1)."
  echo "   Statut / URLs : make status"
  echo "   Lancer les tests plus tard : make test"
  exit 0
fi

echo ""
echo "🧪 Phase tests (Ctrl+C = arrêter les tests, stack conservée ; ensuite : make up-ready si besoin)…"
TESTS_STARTED=1

mkdir -p reports
UP_FULL_ID="${CLOUDITY_TEST_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
UP_FULL_LOG="reports/up-full-test-${UP_FULL_ID}.log"
export CLOUDITY_TEST_RUN_ID="$UP_FULL_ID"
export CLOUDITY_TEST_RUN_LABEL=make-up-full
# Chemin ABSOLU obligatoire : Docker Compose traite un chemin relatif sans ./ comme un nom de volume.
export CLOUDITY_TEST_LOGS_DIR="${ROOT}/reports/test-logs/${UP_FULL_ID}"
mkdir -p "$CLOUDITY_TEST_LOGS_DIR"

set +e
"$MAKE" --no-print-directory test 2>&1 | tee "$UP_FULL_LOG"
TEST_EXIT=${PIPESTATUS[0]}
set -e

chmod +x scripts/ci/generate-test-run-report.sh scripts/dev/send-progress-recap.sh "$HINT" 2>/dev/null || true
CLOUDITY_TEST_RUN_ID="$UP_FULL_ID" CLOUDITY_TEST_LOGS_DIR="${ROOT}/reports/test-logs/${UP_FULL_ID}" \
  ./scripts/ci/generate-test-run-report.sh "$UP_FULL_ID" || true
./scripts/dev/send-progress-recap.sh || true

"$ROOT/scripts/dev/prune-compose-runs.sh" || true

if [ "$TEST_EXIT" -ne 0 ]; then
  echo ""
  echo "❌ Tests post-up-full en échec — voir $UP_FULL_LOG et reports/test-logs/${UP_FULL_ID}/REPORT.md"
  if [ -x "$HINT" ]; then
    "$HINT" tests
  fi
  exit "$TEST_EXIT"
fi

echo "✅ Stack, compte démo et tests OK."
echo "   Rapport : $UP_FULL_LOG"
echo "   Synthèse : reports/test-logs/${UP_FULL_ID}/REPORT.md"
