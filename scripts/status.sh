#!/usr/bin/env bash
# État des services Cloudity : tableau lisible (ports, URL, Up/Down), ordre logique, rafraîchissement via make status-watch.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v tput >/dev/null 2>&1 && [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  DIM=$(tput dim)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  RED="" GREEN="" YELLOW="" DIM="" BOLD="" RESET=""
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# Ordre d’affichage (préfixe cloudity- retiré pour la clé de tri)
ORDER=(
  postgres redis
  db-migrate
  auth-service api-gateway admin-service
  mail-directory password-manager
  drive-service calendar-service notes-service tasks-service contacts-service
  main-frontend admin-dashboard
  adminer redis-commander
)

short_name() {
  local n="$1"
  case "$n" in
    cloudity-main-frontend) echo "main-frontend" ;;
    cloudity-mail-directory-service) echo "mail-directory" ;;
    cloudity-db-migrate) echo "db-migrate" ;;
    cloudity-redis-commander) echo "redis-commander" ;;
    "") echo "—" ;;
    *)
      if [[ "$n" == cloudity-* ]]; then
        echo "${n#cloudity-}"
      else
        echo "$n"
      fi
      ;;
  esac
}

sort_key() {
  local sn="$1"
  local i
  for i in "${!ORDER[@]}"; do
    if [[ "${ORDER[$i]}" == "$sn" ]]; then
      printf '%04d' "$i"
      return
    fi
  done
  printf '9999'
}

host_port() {
  echo "$1" | sed -n 's/.*:\([0-9]*\)->.*/\1/p' | head -1
}

url_for() {
  local port="$1"
  if [ "$port" = "n/a" ] || [ "$port" = "—" ] || [ -z "$port" ]; then
    echo "—"
    return
  fi
  if [ "$port" = "6042" ] || [ "$port" = "6079" ]; then
    echo "localhost:$port"
  else
    echo "http://localhost:$port"
  fi
}

is_up() {
  echo "$1" | grep -qE "Up|running" && echo "Up" || echo "Down"
}

W=30
COLW=6
URLW=34
STATW=8

SEP="$(printf '%*s' 78 '' | tr ' ' '-')"
echo ""
echo "${BOLD}${SEP}${RESET}"
printf "  ${BOLD}Cloudity — État des services${RESET}  ${DIM}%s${RESET}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
echo "${BOLD}${SEP}${RESET}"
echo ""
printf "  ${BOLD}%-${W}s %-${COLW}s %-${URLW}s %-${STATW}s${RESET}\n" "SERVICE" "PORT" "URL" "ÉTAT"
echo "  ${SEP}"

raw=$($COMPOSE -f docker-compose.yml ps -a --format "{{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true)

tmp=$(mktemp)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  name=$(echo "$line" | awk -F'\t' '{print $1}')
  status=$(echo "$line" | awk -F'\t' '{print $2}')
  ports=$(echo "$line" | awk -F'\t' '{print $3}')
  port=$(host_port "$ports")
  # Libellé ASCII fixe pour l’alignement des colonnes (évite largeur variable du tiret Unicode)
  [ -z "$port" ] && port="n/a"
  sn=$(short_name "$name")
  url=$(url_for "$port")
  up=$(is_up "$status")
  sk=$(sort_key "$sn")
  printf '%s\t%s\t%s\t%s\t%s\n' "$sk" "$sn" "$port" "$url" "$up"
done <<< "$raw" | sort -t$'\t' -k1,1n -k2,2 | cut -f2- >"$tmp"

shown=0
while IFS=$'\t' read -r sn port url up; do
  [ -z "${sn:-}" ] && continue
  shown=1
  if [ "$up" = "Up" ]; then
    printf "  %-${W}s %-${COLW}s %-${URLW}s ${GREEN}%-${STATW}s${RESET}\n" "$sn" "$port" "$url" "$up"
  else
    printf "  %-${W}s %-${COLW}s %-${URLW}s ${RED}%-${STATW}s${RESET}\n" "$sn" "$port" "$url" "$up"
  fi
done <"$tmp"
rm -f "$tmp"

if [ "$shown" = "0" ]; then
  echo "  ${YELLOW}Aucun conteneur Cloudity listé. Lancez : make up${RESET}"
fi

echo "  ${SEP}"
echo ""
echo "  ${DIM}Rafraîchissement : ${RESET}${BOLD}make status-watch${RESET}${DIM}  ·  alias :${RESET} ${BOLD}make statys${RESET}${DIM}|${RESET}${BOLD}stats${RESET}${DIM}|${RESET}${BOLD}stat${RESET}"
echo ""
