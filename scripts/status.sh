#!/usr/bin/env bash
# Un seul tableau : Nom du service, Port, URL, État (Up vert / Down rouge).

set -e
cd "$(dirname "$0")/.."

if command -v tput >/dev/null 2>&1 && [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  RED="" GREEN="" BOLD="" RESET=""
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

echo ""
echo "${BOLD}📊 Cloudity — Services${RESET}"
echo ""

# En-tête
printf "  ${BOLD}%-28s %-6s %-30s %-6s${RESET}\n" "SERVICE" "PORT" "URL" "STATUS"
echo "  ───────────────────────────── ────── ───────────────────────────── ──────"

# Récupérer la sortie de docker compose ps (tabs pour parsing)
raw=$($COMPOSE -f docker-compose.yml ps --format "{{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true)

# Noms d'affichage : correspond au nom logique du service (sans préfixe cloudity-),
# avec quelques alias plus courts quand c'est plus lisible.
short_name() {
  local n="$1"
  case "$n" in
    cloudity-main-frontend) echo "main-frontend" ;;
    cloudity-mail-directory-service) echo "mail-directory" ;;
    cloudity-db-migrate) echo "db-migrate" ;;
    cloudity-redis-commander) echo "redis-commander" ;;
    "")
      echo "—"
      ;;
    *)
      if [[ "$n" == cloudity-* ]]; then
        echo "${n#cloudity-}"
      else
        echo "$n"
      fi
      ;;
  esac
}

# Extraire le port hôte (ex: 0.0.0.0:6001->3000/tcp -> 6001)
host_port() {
  echo "$1" | sed -n 's/.*:\([0-9]*\)->.*/\1/p' | head -1
}

url_for() {
  local port="$1"
  local name="$2"
  if [ "$port" = "6042" ] || [ "$port" = "6079" ]; then
    echo "localhost:$port"
  else
    echo "http://localhost:$port"
  fi
}

is_up() {
  echo "$1" | grep -q "Up" && echo "Up" || echo "Down"
}

while IFS= read -r line; do
  [ -z "$line" ] && continue
  name=$(echo "$line" | awk -F'\t' '{print $1}')
  status=$(echo "$line" | awk -F'\t' '{print $2}')
  ports=$(echo "$line" | awk -F'\t' '{print $3}')
  port=$(host_port "$ports")
  [ -z "$port" ] && port="—"
  sn=$(short_name "$name")
  url=$(url_for "$port" "$name")
  up=$(is_up "$status")
  if [ "$up" = "Up" ]; then
    printf "  %-28s %-6s %-30s ${GREEN}%-6s${RESET}\n" "$sn" "$port" "$url" "$up"
  else
    printf "  %-28s %-6s %-30s ${RED}%-6s${RESET}\n" "$sn" "$port" "$url" "$up"
  fi
done <<< "$raw"

echo ""
