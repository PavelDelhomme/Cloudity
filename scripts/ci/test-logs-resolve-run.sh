#!/usr/bin/env bash
# Résout le répertoire d'un run tests : reports/test-logs/<run-id>/
# Priorité : argument / RUN_ID / CLOUDITY_TEST_RUN_ID → .last-run-id → plus récent (mtime).
# Usage : ./scripts/ci/test-logs-resolve-run.sh [run-id]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

LOGS_ROOT="reports/test-logs"
RUN_ID="${1:-${RUN_ID:-${CLOUDITY_TEST_RUN_ID:-}}}"

resolve_dir() {
  local id="$1"
  local dir="${LOGS_ROOT}/${id}"
  if [ -d "$dir" ]; then
    printf '%s\n' "$dir"
    return 0
  fi
  echo "❌ Run introuvable : ${dir}" >&2
  return 1
}

if [ -n "$RUN_ID" ]; then
  resolve_dir "$RUN_ID"
  exit 0
fi

if [ -f "${LOGS_ROOT}/.last-run-id" ]; then
  last="$(tr -d '[:space:]' < "${LOGS_ROOT}/.last-run-id")"
  if [ -n "$last" ] && [ -d "${LOGS_ROOT}/${last}" ]; then
    printf '%s\n' "${LOGS_ROOT}/${last}"
    exit 0
  fi
fi

if [ ! -d "$LOGS_ROOT" ]; then
  echo "❌ Aucun run dans ${LOGS_ROOT}/" >&2
  exit 1
fi

# Plus récent par mtime (manifest.jsonl si présent, sinon le dossier).
latest=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  latest="${line#* }"
  break
done < <(
  find "$LOGS_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.*' 2>/dev/null | while read -r d; do
    ref="${d}/manifest.jsonl"
    [ -f "$ref" ] || ref="$d"
    ts="$(stat -c '%Y' "$ref" 2>/dev/null || stat -f '%m' "$ref" 2>/dev/null || echo 0)"
    printf '%s %s\n' "$ts" "$d"
  done | sort -rn
)

if [ -z "$latest" ]; then
  echo "❌ Aucun run dans ${LOGS_ROOT}/" >&2
  exit 1
fi

printf '%s\n' "$latest"
