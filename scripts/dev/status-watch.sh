#!/usr/bin/env bash
# Rafraîchit make status toutes les N secondes.
# Ctrl+C arrête l'actualisation et conserve le dernier tableau affiché (pas de clear final).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INTERVAL="${CLOUDITY_STATUS_WATCH_INTERVAL:-10}"

export CLOUDITY_STATUS_FORCE_COLOR=1

_stop=0
sleep_pid=""

_on_stop() {
  _stop=1
  if [[ -n "${sleep_pid:-}" ]]; then
    kill "$sleep_pid" 2>/dev/null || true
  fi
}

trap '_on_stop' INT TERM

while [[ "$_stop" != "1" ]]; do
  if [[ -t 1 ]]; then
    printf '\033[2J\033[H'
  fi
  "$ROOT/scripts/dev/status.sh" || true
  printf '\n'
  printf '  \033[2mActualisation toutes les %ss — Ctrl+C pour arrêter (dernier état conservé)\033[0m\n' "$INTERVAL"
  if [[ "$_stop" == "1" ]]; then
    break
  fi
  sleep "$INTERVAL" &
  sleep_pid=$!
  wait "$sleep_pid" 2>/dev/null || true
  sleep_pid=""
done

printf '\n  \033[2mActualisation arrêtée.\033[0m  Relance : \033[1mmake status-watch\033[0m  ·  instantané : \033[1mmake status\033[0m\n\n'
