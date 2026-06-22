#!/usr/bin/env bash
# Vérifie que les ports hôte PORT_* (.env / Makefile) sont libres avant make up.
# Usage : make check-ports

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
fi

declare -A DEFAULTS=(
  [PORT_DASHBOARD]=6001
  [PORT_GATEWAY]=6080
  [PORT_AUTH]=6081
  [PORT_ADMIN]=6082
  [PORT_POSTGRES]=6042
  [PORT_REDIS]=6079
  [PORT_MAIL_DIRECTORY]=6050
  [PORT_PASS_MGR]=6051
  [PORT_CALENDAR]=6052
  [PORT_NOTES]=6053
  [PORT_TASKS]=6054
  [PORT_DRIVE]=6055
  [PORT_CONTACTS]=6056
  [PORT_PHOTOS]=6057
  [PORT_ADMINER]=6083
  [PORT_REDIS_COMMANDER]=6084
)

ORDER=(
  PORT_DASHBOARD PORT_GATEWAY PORT_AUTH PORT_ADMIN
  PORT_MAIL_DIRECTORY PORT_PASS_MGR PORT_CALENDAR PORT_NOTES PORT_TASKS
  PORT_DRIVE PORT_CONTACTS PORT_PHOTOS
  PORT_POSTGRES PORT_REDIS PORT_ADMINER PORT_REDIS_COMMANDER
)

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -P -n >/dev/null 2>&1
    return
  fi
  return 1
}

busy=0
echo "Ports Cloudity (hôte) — source : .env + défauts Makefile"
echo ""
printf "%-24s %6s  %s\n" "Variable" "Port" "État"
printf "%-24s %6s  %s\n" "--------" "----" "----"

for var in "${ORDER[@]}"; do
  default="${DEFAULTS[$var]}"
  port="${!var:-$default}"
  if port_in_use "$port"; then
    printf "%-24s %6s  ❌ occupé\n" "$var" "$port"
    busy=$((busy + 1))
  else
    printf "%-24s %6s  ✅ libre\n" "$var" "$port"
  fi
done

echo ""
if [ "$busy" -gt 0 ]; then
  echo "❌ ${busy} port(s) occupé(s) — ajuster dans .env (voir docs/operations/PORTS-HOTES.md) ou arrêter le processus conflictuel."
  exit 1
fi
echo "✅ Tous les ports Cloudity sont libres."
