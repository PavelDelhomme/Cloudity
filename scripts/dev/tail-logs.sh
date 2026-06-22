#!/usr/bin/env bash
# Affiche l'historique récent des logs Compose puis suit les nouveaux (même si la stack
# n'est pas encore démarrée — utile pendant make up-full dans un autre terminal).
#
# Couleurs : conservées sur terminal (TTY) via `docker compose logs --color always`.
# CLOUDITY_LOGS_HIDE_HEALTH=1 désactive les couleurs (filtrage grep).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
COMPOSE_FILES="-f docker-compose.yml"
TAIL="${CLOUDITY_LOGS_TAIL:-200}"
HIDE_HEALTH="${CLOUDITY_LOGS_HIDE_HEALTH:-0}"

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
      || true
  else
    # Pas de pipe : couleurs Compose préservées.
    compose_cmd logs "${cargs[@]}" "$@" 2>&1
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
