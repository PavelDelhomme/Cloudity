#!/usr/bin/env bash
# Affiche l'historique récent des logs Compose puis suit les nouveaux (même si la stack
# n'est pas encore démarrée — utile pendant make up-full dans un autre terminal).
#
# Couleurs : conservées sur terminal (TTY) via `docker compose logs --color always`.
# CLOUDITY_LOGS_HIDE_HEALTH=1 désactive les couleurs (filtrage grep).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
COMPOSE_FILES="-f docker-compose.yml"
TAIL="${CLOUDITY_LOGS_TAIL:-200}"
HIDE_HEALTH="${CLOUDITY_LOGS_HIDE_HEALTH:-0}"
LOG_ARCHIVE_DIR="${CLOUDITY_LOGS_ARCHIVE_DIR:-reports/container-logs}"
LOG_MAX_BYTES="${CLOUDITY_LOGS_MAX_BYTES:-52428800}"
LOG_PERSIST="${CLOUDITY_LOGS_PERSIST:-1}"
ARCHIVE_FILE="${LOG_ARCHIVE_DIR}/live-$(date +%Y%m%d).log"

mkdir -p "$LOG_ARCHIVE_DIR"
# Rotation si fichier du jour trop gros (>50 Mo par défaut)
if [ -f "$ARCHIVE_FILE" ] && [ "$(stat -c%s "$ARCHIVE_FILE" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]; then
  mv "$ARCHIVE_FILE" "${ARCHIVE_FILE%.log}-rotated-$(date +%H%M%S).log"
fi
# Purge fichiers > 14 jours
find "$LOG_ARCHIVE_DIR" -name '*.log' -mtime +14 -delete 2>/dev/null || true

if [ "$LOG_PERSIST" = "1" ]; then
  echo "# session $(date -Iseconds) pid=$$" >> "$ARCHIVE_FILE"
fi

compose_cmd() {
  # shellcheck disable=SC2086
  $COMPOSE $COMPOSE_FILES --profile dev "$@"
}

# Couleurs Docker Compose (noms de services, timestamps) — uniquement si TTY et pas de filtre.
color_args() {
  if [ "$HIDE_HEALTH" = "1" ]; then
    echo --no-color
  elif [ -t 1 ]; then
    echo --color always
  else
    echo --no-color
  fi
}

stream_compose_logs() {
  local -a cargs
  cargs=($(color_args))
  if [ "$HIDE_HEALTH" = "1" ]; then
    # grep retire les codes ANSI — on prévient l'utilisateur.
    compose_cmd logs "${cargs[@]}" "$@" 2>/dev/null \
      | stdbuf -oL -eL grep --line-buffered -Ev \
        'GET[[:space:]]+"/health"|GET[[:space:]]+/health |/health HTTP|-> 200[[:space:]]+0s[[:space:]]*$|\[gateway\] GET /health' \
      | tee_append_if_enabled \
      || true
  else
    if [ "$LOG_PERSIST" = "1" ]; then
      compose_cmd logs "${cargs[@]}" "$@" 2>&1 | tee -a "$ARCHIVE_FILE"
    else
      compose_cmd logs "${cargs[@]}" "$@" 2>&1
    fi
  fi
}

tee_append_if_enabled() {
  if [ "$LOG_PERSIST" = "1" ]; then
    tee -a "$ARCHIVE_FILE"
  else
    cat
  fi
}

echo "📋 Dernières ${TAIL} lignes (conteneurs existants, y compris arrêtés)…"
if [ -t 1 ] && [ "$HIDE_HEALTH" != "1" ]; then
  echo "   Couleurs actives (terminal). Astuce : CLOUDITY_LOGS_HIDE_HEALTH=1 masque /health (sans couleur)."
elif [ "$HIDE_HEALTH" = "1" ]; then
  echo "   Filtre /health actif — couleurs désactivées. Retirez CLOUDITY_LOGS_HIDE_HEALTH pour les couleurs."
else
  echo "   Sortie non-TTY — couleurs désactivées."
fi
if [ "$LOG_PERSIST" = "1" ]; then
  echo "   Archive disque : ${ARCHIVE_FILE} (max ${LOG_MAX_BYTES} o/jour, CLOUDITY_LOGS_PERSIST=0 pour désactiver)"
fi
echo ""

if compose_cmd ps -a -q 2>/dev/null | grep -q .; then
  stream_compose_logs --tail="$TAIL" || true
else
  echo "   (aucun conteneur Cloudity pour l'instant — en attente du démarrage…)"
fi

echo ""
echo "📡 Suivi live (Ctrl+C) — les services apparaîtront au fur et à mesure…"
echo ""

while true; do
  if compose_cmd ps -q 2>/dev/null | grep -q .; then
    stream_compose_logs -f --tail=0
    exit 0
  fi
  sleep 2
done
