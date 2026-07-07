#!/usr/bin/env bash
# État des services Cloudity : tableau lisible (ports, URL, Up/Down), ordre logique, rafraîchissement via make status-watch.
#
# Couleurs : codes ANSI (pas seulement tput). Actives si stdout est un TTY, ou si forcées :
#   CLOUDITY_STATUS_FORCE_COLOR=1  (make status-watch)  ·  FORCE_COLOR=1  ·  CLICOLOR_FORCE=1
# Respecte NO_COLOR sauf si CLOUDITY_STATUS_FORCE_COLOR=1 (mode watch).
#
# Conteneurs masqués : *-run-* = jobs éphémères `docker compose run` (tests Vitest, go test…).
# Voir docs/architecture/SERVICES.md § 4 et docs/operations/TESTS.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

RED="" GREEN="" YELLOW="" DIM="" BOLD="" CYAN="" RESET=""

_use_color() {
  [[ -z "${NO_COLOR:-}" || "${CLOUDITY_STATUS_FORCE_COLOR:-}" == "1" ]] || return 1
  if [[ -t 1 ]]; then return 0; fi
  if [[ "${CLOUDITY_STATUS_FORCE_COLOR:-}" == "1" ]]; then return 0; fi
  if [[ "${FORCE_COLOR:-}" == "1" ]]; then return 0; fi
  if [[ "${CLICOLOR_FORCE:-}" == "1" ]]; then return 0; fi
  return 1
}

if _use_color; then
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  CYAN=$'\033[36m'
  DIM=$'\033[2m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
fi

# Conteneur one-shot `docker compose run` (tests CI, Vitest, go test…) — pas un service long-running.
is_compose_run_ephemeral() {
  local name="$1"
  [[ "$name" == *"-run-"* ]]
}

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
  mail-directory passwords-service
  drive-service photos-service calendar-service notes-service tasks-service contacts-service
  cloudity-web
  adminer redis-commander
)

short_name() {
  local n="$1"
  case "$n" in
    cloudity-main-frontend) echo "main-frontend" ;; # ancien nom de conteneur
    cloudity-web) echo "cloudity-web" ;;
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

# db-migrate : conteneur one-shot (migrations) — « Exited (0) » est le comportement normal, pas une panne.
state_for_row() {
  local sn="$1"
  local status="$2"
  if [[ "$sn" == "db-migrate" ]]; then
    if echo "$status" | grep -qE 'Exited \(0\)'; then
      echo "OK (job)"
      return
    fi
    if echo "$status" | grep -qE 'Exited \([1-9][0-9]*\)'; then
      echo "Fail"
      return
    fi
  fi
  is_up "$status"
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

ephemeral_hidden=0
tmp=$(mktemp)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  name=$(echo "$line" | awk -F'\t' '{print $1}')
  if is_compose_run_ephemeral "$name"; then
    ephemeral_hidden=$((ephemeral_hidden + 1))
    continue
  fi
  status=$(echo "$line" | awk -F'\t' '{print $2}')
  ports=$(echo "$line" | awk -F'\t' '{print $3}')
  port=$(host_port "$ports")
  # Libellé ASCII fixe pour l’alignement des colonnes (évite largeur variable du tiret Unicode)
  [ -z "$port" ] && port="n/a"
  sn=$(short_name "$name")
  url=$(url_for "$port")
  up=$(state_for_row "$sn" "$status")
  sk=$(sort_key "$sn")
  printf '%s\t%s\t%s\t%s\t%s\n' "$sk" "$sn" "$port" "$url" "$up"
done <<< "$raw" | sort -t$'\t' -k1,1n -k2,2 | cut -f2- >"$tmp"

shown=0
web_up=0
gateway_up=0
while IFS=$'\t' read -r sn port url up; do
  [ -z "${sn:-}" ] && continue
  shown=1
  if [ "$up" = "Up" ]; then
    if [ "$sn" = "cloudity-web" ]; then web_up=1; fi
    if [ "$sn" = "api-gateway" ]; then gateway_up=1; fi
  fi
  if [ "$up" = "Up" ] || [ "$up" = "OK (job)" ]; then
    printf "  %-${W}s %-${COLW}s %-${URLW}s ${GREEN}%-${STATW}s${RESET}\n" "$sn" "$port" "$url" "$up"
  elif [ "$up" = "Fail" ]; then
    printf "  %-${W}s %-${COLW}s %-${URLW}s ${RED}%-${STATW}s${RESET}\n" "$sn" "$port" "$url" "$up"
  else
    printf "  %-${W}s %-${COLW}s %-${URLW}s ${YELLOW}%-${STATW}s${RESET}\n" "$sn" "$port" "$url" "$up"
  fi
done <"$tmp"
rm -f "$tmp"

stack_accessible=0
if [ "$web_up" = "1" ] && [ "$gateway_up" = "1" ]; then
  stack_accessible=1
fi

if [ "$shown" = "0" ]; then
  echo "  ${YELLOW}Aucun conteneur Cloudity listé. Lancez : make up${RESET}"
fi

if [ "$ephemeral_hidden" -gt 0 ]; then
  echo "  ${DIM}${ephemeral_hidden} conteneur(s) éphémère(s) « compose run » masqué(s) (*-run-*) — tests CI, pas la stack.${RESET}"
  echo "  ${DIM}Arrêter un run bloqué : docker rm -f <nom>  ·  doc : docs/architecture/SERVICES.md § 4${RESET}"
fi

echo "  ${SEP}"
echo ""

# --- URLs « produit » (alignées STATUS.md §0 — ports = Makefile / docker-compose) ---
# Ne pas `source .env` : certaines valeurs contiennent des espaces (ex. WEBAUTHN_RP_NAME=Cloudity Admin).
_env_get() {
  local key="$1"
  local default="${2:-}"
  if [[ ! -f .env ]]; then
    printf '%s' "$default"
    return
  fi
  local line val
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" .env 2>/dev/null | tail -1 || true)
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return
  fi
  val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

PORT_GATEWAY="$(_env_get PORT_GATEWAY 6002)"
PORT_DASHBOARD="$(_env_get PORT_DASHBOARD 6001)"
PORT_AUTH="$(_env_get PORT_AUTH 6003)"
PORT_ADMIN="$(_env_get PORT_ADMIN 6004)"
PORT_POSTGRES="$(_env_get PORT_POSTGRES 6042)"
PORT_REDIS="$(_env_get PORT_REDIS 6079)"
PORT_ADMINER="$(_env_get PORT_ADMINER 6083)"
PORT_REDIS_COMMANDER="$(_env_get PORT_REDIS_COMMANDER 6084)"

HOST="${CLOUDITY_STATUS_HOST:-localhost}"
PROTO="${CLOUDITY_STATUS_PROTO:-http}"
ORIGIN="${PROTO}://${HOST}:${PORT_DASHBOARD}"
API="${PROTO}://${HOST}:${PORT_GATEWAY}"

echo "  ${BOLD}URLs d'accès (navigateur / API)${RESET}  ${DIM}— même tableau que STATUS.md §0 ; ports : PORTS-HOTES.md${RESET}"
echo "  ${SEP}"
if [ "$stack_accessible" = "1" ]; then
  echo "  ${DIM}Depuis un autre appareil sur le LAN :${RESET} ${BOLD}export CLOUDITY_STATUS_HOST='<IP_de_ta_machine>'${RESET} ${DIM}puis relancer${RESET} ${BOLD}make status${RESET}${DIM} (HTTP dev par défaut ; prod = TLS NPM, voir DEPLOIEMENT-VPS-PORTAINER-NPM.md).${RESET}"
  echo "  ${SEP}"
  printf "  ${DIM}%-22s${RESET} %s\n" "Hub / suite" "${ORIGIN}/app"
  printf "  ${DIM}%-22s${RESET} %s\n" "Connexion" "${ORIGIN}/login"
  printf "  ${DIM}%-22s${RESET} %s\n" "Inscription" "${ORIGIN}/register"
  printf "  ${DIM}%-22s${RESET} %s\n" "Pass" "${ORIGIN}/app/pass"
  printf "  ${DIM}%-22s${RESET} %s\n" "Mail" "${ORIGIN}/app/mail"
  printf "  ${DIM}%-22s${RESET} %s\n" "Drive" "${ORIGIN}/app/drive"
  printf "  ${DIM}%-22s${RESET} %s\n" "Back-office" "${ORIGIN}/4dm1n"
  printf "  ${DIM}%-22s${RESET} %s\n" "API (gateway)" "${API}/health"
  printf "  ${DIM}%-22s${RESET} %s\n" "Auth health" "${API}/auth/health"
  printf "  ${DIM}%-22s${RESET} %s\n" "Playwright (API)" "${API}  ${DIM}# ex. PLAYWRIGHT_API_URL${RESET}"
  echo "  ${SEP}"
  printf "  ${DIM}%-22s${RESET} %s\n" "Postgres (psql)" "${HOST}:${PORT_POSTGRES}"
  printf "  ${DIM}%-22s${RESET} %s\n" "Redis" "${HOST}:${PORT_REDIS}"
  printf "  ${DIM}%-22s${RESET} %s\n" "Adminer" "${PROTO}://${HOST}:${PORT_ADMINER}"
  printf "  ${DIM}%-22s${RESET} %s\n" "Redis Commander" "${PROTO}://${HOST}:${PORT_REDIS_COMMANDER}"
else
  echo "  ${YELLOW}Stack arrêtée — aucune URL n'est joignable pour l'instant.${RESET}"
  if [ "$shown" = "1" ]; then
    echo "  ${DIM}Des conteneurs existent mais cloudity-web et/ou api-gateway ne sont pas Up.${RESET}"
  fi
  echo "  ${DIM}Démarrez la stack :${RESET} ${BOLD}make up${RESET}"
  echo "  ${DIM}Référence des ports une fois démarrée :${RESET} PORTS-HOTES.md, STATUS.md §0"
fi
echo "  ${SEP}"
echo ""
echo "  ${DIM}Rafraîchissement : ${RESET}${BOLD}make status-watch${RESET}${DIM}  (Ctrl+C conserve le dernier état)  ·  alias :${RESET} ${BOLD}make statys${RESET}${DIM}|${RESET}${BOLD}stats${RESET}${DIM}|${RESET}${BOLD}stat${RESET}"
echo ""
