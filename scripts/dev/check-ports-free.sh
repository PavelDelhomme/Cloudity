#!/usr/bin/env bash
# Vérifie que les ports hôte PORT_* (.env / Makefile) sont libres avant make up.
# Usage : make check-ports

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/dev/ports-sequential.sh
source "$ROOT/scripts/dev/ports-sequential.sh"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
fi

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
echo "Ports Cloudity (hôte) — série séquentielle 6001–6012 + infra"
echo ""
printf "%-24s %6s  %s\n" "Variable" "Port" "État"
printf "%-24s %6s  %s\n" "--------" "----" "----"

for var in "${ORDER[@]}"; do
  port="${!var}"
  if port_in_use "$port"; then
    printf "%-24s %6s  ❌ occupé\n" "$var" "$port"
    busy=$((busy + 1))
  else
    printf "%-24s %6s  ✅ libre\n" "$var" "$port"
  fi
done

echo ""
if [ "$busy" -gt 0 ]; then
  echo "❌ ${busy} port(s) occupé(s) — ajuster dans .env (make ports-sequential) ou make down."
  exit 1
fi
echo "✅ Tous les ports Cloudity sont libres."
