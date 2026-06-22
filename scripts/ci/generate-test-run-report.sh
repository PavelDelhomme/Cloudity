#!/usr/bin/env bash
# Génère REPORT.md à partir de manifest.jsonl + logs capturés (reports/test-logs/<run-id>/).
# Usage : CLOUDITY_TEST_LOGS_DIR=reports/test-logs/xxx ./scripts/ci/generate-test-run-report.sh
#         ou avec run-id : ./scripts/ci/generate-test-run-report.sh 20260622-152030

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUN_ID="${1:-${CLOUDITY_TEST_RUN_ID:-}}"
LOGS_DIR="${CLOUDITY_TEST_LOGS_DIR:-}"

if [ -z "$LOGS_DIR" ] && [ -n "$RUN_ID" ]; then
  LOGS_DIR="reports/test-logs/${RUN_ID}"
fi

if [ -z "$LOGS_DIR" ] || [ ! -d "$LOGS_DIR" ]; then
  echo "❌ Répertoire logs introuvable (CLOUDITY_TEST_LOGS_DIR ou run-id requis)." >&2
  exit 1
fi

REPORT="${LOGS_DIR}/REPORT.md"
MANIFEST="${LOGS_DIR}/manifest.jsonl"
UP_FULL_LOG=""

if [ -n "$RUN_ID" ] && [ -f "reports/up-full-test-${RUN_ID}.log" ]; then
  UP_FULL_LOG="reports/up-full-test-${RUN_ID}.log"
fi

{
  echo "# Rapport tests Cloudity"
  echo ""
  echo "- **Run ID** : \`${RUN_ID:-$(basename "$LOGS_DIR")}\`"
  echo "- **Généré** : $(date -Iseconds)"
  echo "- **Répertoire** : \`${LOGS_DIR}\`"
  if [ -n "$UP_FULL_LOG" ]; then
    echo "- **Journal make up-full** : \`${UP_FULL_LOG}\`"
  fi
  echo ""

  if [ ! -f "$MANIFEST" ]; then
    echo "_manifest.jsonl absent — capture partielle._"
    echo ""
    ls -1 "$LOGS_DIR" 2>/dev/null | head -30 | sed 's/^/- /'
    exit 0
  fi

  echo "## Synthèse par phase"
  echo ""
  echo "| Phase | Service | Exit | Durée | Logs |"
  echo "|-------|---------|------|-------|------|"

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    event="$(echo "$line" | jq -r '.event // empty')"
    if [ "$event" = "compose_run" ]; then
      phase="$(echo "$line" | jq -r '.phase // "?"')"
      service="$(echo "$line" | jq -r '.service // "?"')"
      exit_code="$(echo "$line" | jq -r '.exit_code // "?"')"
      started="$(echo "$line" | jq -r '.started_at // ""')"
      ended="$(echo "$line" | jq -r '.ended_at // ""')"
      test_out="$(echo "$line" | jq -r '.test_output // ""')"
      duration=""
      if [ -n "$started" ] && [ -n "$ended" ]; then
        duration="$(python3 -c "
from datetime import datetime
try:
  a=datetime.fromisoformat('${started}'.replace('Z','+00:00'))
  b=datetime.fromisoformat('${ended}'.replace('Z','+00:00'))
  print(int((b-a).total_seconds()))
except Exception:
  print('')
" 2>/dev/null || echo "")"
      fi
      status="✅"
      [ "$exit_code" != "0" ] && status="❌"
      log_link=""
      if [ -n "$test_out" ] && [ -f "${LOGS_DIR}/${test_out}" ]; then
        log_link="[\`${test_out}\`](${test_out})"
      fi
      echo "| ${phase} | ${service} | ${status} ${exit_code} | ${duration}s | ${log_link} |"
    fi
  done < "$MANIFEST"

  echo ""
  echo "## Échecs détectés (extrait)"
  echo ""
  failed_any=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    event="$(echo "$line" | jq -r '.event // empty')"
    if [ "$event" = "compose_run" ]; then
      exit_code="$(echo "$line" | jq -r '.exit_code // 0')"
      if [ "$exit_code" != "0" ]; then
        failed_any=1
        service="$(echo "$line" | jq -r '.service // "?"')"
        test_out="$(echo "$line" | jq -r '.test_output // ""')"
        echo "### ${service}"
        if [ -n "$test_out" ] && [ -f "${LOGS_DIR}/${test_out}" ]; then
          echo '```'
          tail -80 "${LOGS_DIR}/${test_out}" | sed 's/\x1b\[[0-9;]*m//g'
          echo '```'
        else
          echo "_Pas de sortie test capturée._"
        fi
        echo ""
      fi
    fi
  done < "$MANIFEST"

  if [ "$failed_any" -eq 0 ]; then
    echo "_Aucun échec enregistré dans le manifest._"
    echo ""
  fi

  echo "## Logs conteneurs (fichiers)"
  echo ""
  find "$LOGS_DIR" -maxdepth 1 -name '*-container.log' -type f 2>/dev/null | sort | while read -r f; do
    base="$(basename "$f")"
    lines="$(wc -l < "$f" | tr -d ' ')"
    echo "- \`${base}\` (${lines} lignes)"
  done

  echo ""
  echo "## Événements manifest (brut)"
  echo ""
  echo '```jsonl'
  tail -50 "$MANIFEST" 2>/dev/null || true
  echo '```'
} > "$REPORT"

echo "📄 Rapport tests : $REPORT"
