#!/usr/bin/env bash
# Génère REPORT.md à partir de manifest.jsonl + logs capturés (reports/test-logs/<run-id>/).
# Usage : CLOUDITY_TEST_LOGS_DIR=reports/test-logs/xxx ./scripts/ci/generate-test-run-report.sh
#         make test-report          — regénère le dernier run
#         make test-report-show     — affiche le dernier REPORT.md (un seul fichier)

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

chmod +x "$(dirname "$0")/rebuild-test-manifest.sh" 2>/dev/null || true
"$(dirname "$0")/rebuild-test-manifest.sh" "$LOGS_DIR" >/dev/null || true

REPORT="${LOGS_DIR}/REPORT.md"
MANIFEST="${LOGS_DIR}/manifest.jsonl"
UP_FULL_LOG=""

if [ -n "$RUN_ID" ] && [ -f "reports/up-full-test-${RUN_ID}.log" ]; then
  UP_FULL_LOG="reports/up-full-test-${RUN_ID}.log"
fi

# Résout un chemin relatif au run (compat anciens manifests sans préfixe phase/).
resolve_run_file() {
  local rel="$1"
  [ -z "$rel" ] && return 1
  if [ -f "${LOGS_DIR}/${rel}" ]; then
    printf '%s\n' "${LOGS_DIR}/${rel}"
    return 0
  fi
  local found
  found="$(find "$LOGS_DIR" -type f -name "$(basename "$rel")" 2>/dev/null | head -1)"
  if [ -n "$found" ] && [ -f "$found" ]; then
    printf '%s\n' "$found"
    return 0
  fi
  return 1
}

duration_seconds() {
  local started="$1"
  local ended="$2"
  python3 -c "
from datetime import datetime
try:
  a=datetime.fromisoformat('${started}'.replace('Z','+00:00'))
  b=datetime.fromisoformat('${ended}'.replace('Z','+00:00'))
  print(int((b-a).total_seconds()))
except Exception:
  print('')
" 2>/dev/null || echo ""
}

parse_duration_from_output() {
  local f="$1"
  [ -f "$f" ] || { echo ""; return; }
  python3 -c "
import re, sys
try:
  text=open(sys.argv[1], errors='replace').read()
except OSError:
  sys.exit(0)
text=re.sub(r'\x1b\[[0-9;]*m', '', text)
secs = []
for pat in (r'Duration\s+([0-9.]+)s', r'Duration.*?([0-9.]+)s', r'passed, .* in ([0-9.]+)s', r'ok\s+\S+\s+([0-9.]+)s'):
  secs.extend(float(x) for x in re.findall(pat, text))
if not secs:
  sys.exit(0)
sec = max(secs)
if sec >= 1:
  print(int(sec + 0.5))
elif sec > 0:
  print('<1')
" "$f" 2>/dev/null || echo ""
}

format_duration_cell() {
  local manifest_duration="$1"
  local output_file="$2"
  local d="$manifest_duration"
  if [ -z "$d" ] || [ "$d" = "0" ]; then
    if [ -n "$output_file" ] && resolved="$(resolve_run_file "$output_file")"; then
      d="$(parse_duration_from_output "$resolved")"
    elif [ -n "$output_file" ] && [ -f "$output_file" ]; then
      d="$(parse_duration_from_output "$output_file")"
    fi
  fi
  if [ "$d" = "<1" ]; then
    echo "<1s"
  elif [ -n "$d" ] && [ "$d" != "0" ]; then
    echo "${d}s"
  else
    echo "—"
  fi
}

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
  echo "> Pour **un seul** rapport : \`make test-report-show\` (évite \`cat reports/test-logs/*/REPORT.md\`)."
  echo ""

  if [ ! -f "$MANIFEST" ]; then
    echo "_manifest.jsonl absent — capture partielle._"
    echo ""
    find "$LOGS_DIR" -type f -name '*.log' 2>/dev/null | head -30 | sed 's|^| - |'
    exit 0
  fi

  unit_exit="$(grep '"event":"unit_tests_done"' "$MANIFEST" 2>/dev/null | tail -1 | jq -r '.exit_code // "?"' || true)"
  unit_exit="${unit_exit:-?}"
  if [ "$unit_exit" = "0" ]; then
    echo "## Verdict global : ✅ tests unitaires OK"
  elif [ "$unit_exit" != "?" ]; then
    echo "## Verdict global : ❌ tests unitaires en échec (exit ${unit_exit})"
  fi
  if grep -q '"recovered":true' "$MANIFEST" 2>/dev/null && ! grep -q '"run_id"' "$MANIFEST" 2>/dev/null; then
    echo ""
    echo "> ⚠️ **Manifest reconstruit** depuis les fichiers capturés (événements \`compose_run\` originaux absents)."
  fi
  echo ""

  echo "## Synthèse par phase"
  echo ""
  echo "| Phase | Service | Exit | Durée | Sortie test | Logs conteneur |"
  echo "|-------|---------|------|-------|-------------|----------------|"

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
      duration="$(duration_seconds "$started" "$ended")"
      duration_cell="$(format_duration_cell "$duration" "$test_out")"
      status="✅"
      [ "$exit_code" != "0" ] && status="❌"
      test_link="_absent_"
      if resolved="$(resolve_run_file "$test_out")"; then
        rel="${resolved#${LOGS_DIR}/}"
        test_link="[\`$(basename "$test_out")\`](${rel})"
      fi
      container_log=""
      if resolved="$(resolve_run_file "${phase}/${service}.log")"; then
        rel="${resolved#${LOGS_DIR}/}"
        container_log="[\`${service}.log\`](${rel})"
      fi
      echo "| ${phase} | ${service} | ${status} ${exit_code} | ${duration_cell} | ${test_link} | ${container_log:-—} |"
    elif [ "$event" = "phase_end" ]; then
      phase="$(echo "$line" | jq -r '.phase // "?"')"
      service="$(basename "$phase")"
      exit_code="$(echo "$line" | jq -r '.exit_code // "?"')"
      started="$(echo "$line" | jq -r '.started_at // ""')"
      ended="$(echo "$line" | jq -r '.ended_at // ""')"
      cmd_log="$(echo "$line" | jq -r '.command_log // ""')"
      duration="$(duration_seconds "$started" "$ended")"
      duration_cell="$(format_duration_cell "$duration" "$cmd_log")"
      status="✅"
      [ "$exit_code" != "0" ] && status="❌"
      test_link="_absent_"
      if resolved="$(resolve_run_file "$cmd_log")"; then
        rel="${resolved#${LOGS_DIR}/}"
        test_link="[\`command-output.log\`](${rel})"
      fi
      container_log=""
      for dep in admin-service postgres redis; do
        if resolved="$(resolve_run_file "${phase}/${dep}.log")"; then
          rel="${resolved#${LOGS_DIR}/}"
          if [ -n "$container_log" ]; then
            container_log="${container_log}, [\`${dep}.log\`](${rel})"
          else
            container_log="[\`${dep}.log\`](${rel})"
          fi
        fi
      done
      echo "| ${phase} | ${service} (pytest) | ${status} ${exit_code} | ${duration_cell} | ${test_link} | ${container_log:-—} |"
    fi
  done < "$MANIFEST"

  echo ""
  echo "## Échecs détectés (extrait sortie test)"
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
        if resolved="$(resolve_run_file "$test_out")"; then
          echo '```'
          tail -80 "$resolved" | sed 's/\x1b\[[0-9;]*m//g'
          echo '```'
        else
          echo "_Pas de sortie test capturée._"
        fi
        echo ""
      fi
    elif [ "$event" = "phase_end" ]; then
      exit_code="$(echo "$line" | jq -r '.exit_code // 0')"
      if [ "$exit_code" != "0" ]; then
        failed_any=1
        phase="$(echo "$line" | jq -r '.phase // "?"')"
        service="$(basename "$phase")"
        cmd_log="$(echo "$line" | jq -r '.command_log // ""')"
        echo "### ${service}"
        if resolved="$(resolve_run_file "$cmd_log")"; then
          echo '```'
          tail -80 "$resolved" | sed 's/\x1b\[[0-9;]*m//g'
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

  echo "## Signaux et avertissements (logs conteneurs)"
  echo ""
  echo "Analyse des fichiers \`*.log\` capturés pendant le run."
  echo ""
  echo "| Signal | Gravité | Occurrences | Action / note |"
  echo "|--------|---------|-------------|---------------|"

  count_matches() {
    local pattern="$1"
    local total=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      local n
      n="$(grep -cE "$pattern" "$f" 2>/dev/null || true)"
      total=$((total + n))
    done < <(find "$LOGS_DIR" -type f -name '*.log' 2>/dev/null)
    echo "$total"
  }

  first_match() {
    local pattern="$1"
    local files
    files="$(find "$LOGS_DIR" -type f -name '*.log' 2>/dev/null)"
    [ -z "$files" ] && return 0
    # shellcheck disable=SC2086
    grep -hE "$pattern" $files 2>/dev/null \
      | head -1 | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-220 || true
  }

  emit_signal_row() {
    local label="$1" severity="$2" hint="$3" pattern="$4"
    local n
    n="$(count_matches "$pattern")"
    if [ "$n" -gt 0 ]; then
      echo "| ${label} | ${severity} | ${n} | ${hint} |"
    fi
  }

  emit_signal_row "Redis overcommit (vm.overcommit_memory)" "⚠️ info hôte" "make host-redis-sysctl · APPLY=1" "Memory overcommit must be enabled"
  emit_signal_row "Postgres connection reset" "ℹ️ souvent bénin" "Client IMAP/tests ferme tôt" "connection reset by peer"
  emit_signal_row "Postgres client lost" "ℹ️ souvent bénin" "Sync mail / pool pgx" "connection to client lost"
  emit_signal_row "IMAP connection closed" "⚠️ mail" "Sync OVH — reconnexion auto" "imap: connection closed"
  emit_signal_row "IMAP sync select (dossier absent)" "ℹ️ bruit" "Candidats multi-fournisseurs" 'sync select "'
  emit_signal_row "Conteneurs test exited 0" "✅ OK" "docker compose run (go test / vitest)" "exited with code 0"
  emit_signal_row "JWT invalid (tests mock)" "ℹ️ tests" "Tokens invalides dans Vitest" "JWT invalid"
  emit_signal_row "Postgres ERROR SQL" "⚠️ souvent seed" "Duplicate key si \`make seed-admin\` sur DB existante" "ERROR:.*duplicate key"

  echo ""
  sample_imap="$(first_match 'imap: connection closed')"
  if [ -n "$sample_imap" ]; then
    echo "**Exemple IMAP** : \`${sample_imap}\`"
    echo ""
  fi
  sample_redis="$(first_match 'Memory overcommit must be enabled')"
  if [ -n "$sample_redis" ]; then
    echo "**Exemple Redis** : \`${sample_redis}\`"
    echo ""
  fi

  echo "## Fichiers logs (arborescence)"
  echo ""
  find "$LOGS_DIR" -type f \( -name '*.log' -o -name 'REPORT.md' \) 2>/dev/null | sort | while read -r f; do
    rel="${f#${LOGS_DIR}/}"
    lines="$(wc -l < "$f" | tr -d ' ')"
    echo "- \`${rel}\` (${lines} lignes)"
  done

  echo ""
  echo "## Archive logs live (make logs)"
  echo ""
  archive_dir="reports/container-logs"
  if [ -d "$archive_dir" ]; then
    latest_archive="$(find "$archive_dir" -name 'live-*.log' -type f 2>/dev/null | sort -r | head -1)"
    if [ -n "$latest_archive" ]; then
      echo "- Dernière archive : \`${latest_archive}\` ($(wc -l < "$latest_archive" | tr -d ' ') lignes)"
      echo "- Analyse manuelle : \`grep -E 'WARNING|FATAL|connection closed|reset by peer' ${latest_archive} | tail -30\`"
    else
      echo "_Aucune archive \`live-*.log\` pour l'instant — lancer \`make logs\`._"
    fi
  else
    echo "_Répertoire ${archive_dir} absent._"
  fi

  echo ""
  echo "## Événements manifest (brut, 50 dernières lignes)"
  echo ""
  echo '```jsonl'
  tail -50 "$MANIFEST" 2>/dev/null || true
  echo '```'
} > "$REPORT"

run_id_file="$(basename "$LOGS_DIR")"
printf '%s\n' "$run_id_file" > "$(dirname "$LOGS_DIR")/.last-run-id"

echo "📄 Rapport tests : $REPORT"
