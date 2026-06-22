#!/usr/bin/env bash
# Reconstruit manifest.jsonl à partir des artefacts capturés (*-test-output.log, command-output.log).
# Utile si le manifest a été tronqué ou si seul run_start subsiste alors que phase1-unit/ est peuplé.
# Usage : ./scripts/ci/rebuild-test-manifest.sh [reports/test-logs/<run-id>]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

LOGS_DIR="${1:-}"
if [ -z "$LOGS_DIR" ]; then
  if [ -x scripts/ci/test-logs-resolve-run.sh ]; then
    LOGS_DIR="$(./scripts/ci/test-logs-resolve-run.sh)"
  else
    echo "❌ Répertoire run requis." >&2
    exit 1
  fi
fi

MANIFEST="${LOGS_DIR}/manifest.jsonl"
mkdir -p "$LOGS_DIR"

infer_exit_code() {
  local f="$1"
  [ -f "$f" ] || { echo "?"; return; }

  if grep -qE 'Tests?[[:space:]]+[0-9]+[[:space:]]+failed|Test Files[[:space:]]+[0-9]+ failed| [0-9]+ failed|FAIL[[:space:]]|===+ FAIL|AssertionError|SyntaxError|Transform failed|npm ERR!' "$f" 2>/dev/null; then
    echo 1
    return
  fi
  if grep -qE '^PASS$| passed in |Test Files.*passed|Tests.*passed|[0-9]+ passed| ok[[:space:]]+github\.com/|passed, [0-9]+ warning' "$f" 2>/dev/null; then
    echo 0
    return
  fi
  echo "?"
}

file_iso_time() {
  local f="$1"
  date -Iseconds -r "$f" 2>/dev/null || stat -c '%y' "$f" 2>/dev/null | sed 's/ /T/;s/\..*//' || echo ""
}

artifact_count=0
while IFS= read -r _; do
  artifact_count=$((artifact_count + 1))
done < <(find "$LOGS_DIR" -type f \( -name '*-test-output.log' -o -name 'command-output.log' \) 2>/dev/null)

compose_count=0
phase_end_count=0
if [ -f "$MANIFEST" ]; then
  compose_count="$(grep -c '"event":"compose_run"' "$MANIFEST" 2>/dev/null || true)"
  phase_end_count="$(grep -c '"event":"phase_end"' "$MANIFEST" 2>/dev/null || true)"
fi
compose_count="${compose_count:-0}"
phase_end_count="${phase_end_count:-0}"

expected=$((artifact_count))
recorded=$((compose_count + phase_end_count))

if [ "$artifact_count" -eq 0 ]; then
  echo "ℹ️  Aucun artefact test dans ${LOGS_DIR} — rien à reconstruire."
  exit 0
fi

if [ "$recorded" -ge "$expected" ]; then
  echo "✅ Manifest déjà complet (${recorded} événements / ${artifact_count} artefacts)."
  exit 0
fi

if [ -f "$MANIFEST" ]; then
  cp "$MANIFEST" "${MANIFEST}.bak.$(date +%Y%m%d-%H%M%S)"
fi

{
  if [ -f "$MANIFEST" ]; then
    grep -vE '"event":"(compose_run|phase_end|unit_tests_done)"' "$MANIFEST" 2>/dev/null || true
  else
    run_id="$(basename "$LOGS_DIR")"
    echo "{\"event\":\"run_start\",\"run_id\":\"${run_id}\",\"label\":\"recovered\",\"started_at\":\"$(date -Iseconds)\"}"
  fi

  failed=0

  while IFS= read -r test_file; do
    [ -n "$test_file" ] || continue
    phase_dir="$(dirname "$test_file")"
    phase="${phase_dir#${LOGS_DIR}/}"
    service="$(basename "$phase_dir")"
    exit_code="$(infer_exit_code "$test_file")"
    [ "$exit_code" = "1" ] && failed=1
    rel="${phase}/$(basename "$test_file")"
    ended_at="$(file_iso_time "$test_file")"
    echo "{\"event\":\"compose_run\",\"phase\":\"${phase}\",\"service\":\"${service}\",\"exit_code\":${exit_code},\"started_at\":\"${ended_at}\",\"ended_at\":\"${ended_at}\",\"test_output\":\"${rel}\",\"recovered\":true}"
  done < <(find "$LOGS_DIR" -type f -name '*-test-output.log' 2>/dev/null | sort)

  while IFS= read -r cmd_file; do
    [ -n "$cmd_file" ] || continue
    phase_dir="$(dirname "$cmd_file")"
    phase="${phase_dir#${LOGS_DIR}/}"
    exit_code="$(infer_exit_code "$cmd_file")"
    [ "$exit_code" = "1" ] && failed=1
    rel="${phase}/command-output.log"
    ended_at="$(file_iso_time "$cmd_file")"
    echo "{\"event\":\"phase_end\",\"phase\":\"${phase}\",\"exit_code\":${exit_code},\"started_at\":\"${ended_at}\",\"ended_at\":\"${ended_at}\",\"command_log\":\"${rel}\",\"recovered\":true}"
  done < <(find "$LOGS_DIR" -type f -name 'command-output.log' 2>/dev/null | sort)

  echo "{\"event\":\"unit_tests_done\",\"exit_code\":${failed},\"at\":\"$(date -Iseconds)\",\"recovered\":true}"
} > "${MANIFEST}.tmp"

mv "${MANIFEST}.tmp" "$MANIFEST"
chmod 600 "$MANIFEST" 2>/dev/null || true

echo "🔧 Manifest reconstruit : ${MANIFEST} (${artifact_count} artefacts, exit=${failed})"
