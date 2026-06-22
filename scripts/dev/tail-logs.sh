#!/usr/bin/env bash
# Affiche l'historique récent des logs Compose puis suit les nouveaux (même si la stack
# n'est pas encore démarrée — utile pendant make up-full dans un autre terminal).
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

filter_logs() {
  if [ "$HIDE_HEALTH" = "1" ]; then
    grep -Ev 'GET[[:space:]]+"/health"|/health HTTP|-> 200.*health' || true
  else
    cat
  fi
}

echo "📋 Dernières ${TAIL} lignes (conteneurs existants, y compris arrêtés)…"
echo "   Astuce : CLOUDITY_LOGS_HIDE_HEALTH=1 make logs pour masquer les sondes /health"
echo ""

if compose_cmd ps -a -q 2>/dev/null | grep -q .; then
  compose_cmd logs --tail="$TAIL" 2>/dev/null | filter_logs || true
else
  echo "   (aucun conteneur Cloudity pour l'instant — en attente du démarrage…)"
fi

echo ""
echo "📡 Suivi live (Ctrl+C) — les services apparaîtront au fur et à mesure…"
echo ""

while true; do
  if compose_cmd ps -q 2>/dev/null | grep -q .; then
    compose_cmd logs -f --tail=0 2>/dev/null | filter_logs
    exit 0
  fi
  sleep 2
done
