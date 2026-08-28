#!/usr/bin/env bash
# Recrée web + gateway + admin avec les images GHCR :latest (sans toucher postgres/redis).
# À lancer sur le VPS quand Watchtower n'a pas recréé les conteneurs après un push prod.
#
# Usage VPS :
#   CLOUDITY_COMPOSE_DIR=/tmp/cloudity-build bash scripts/deploy/prod-recreate-front.sh
#
# Prérequis : docker-compose.ghcr.yml + stack.env (ou .env) dans CLOUDITY_COMPOSE_DIR
set -euo pipefail

COMPOSE_DIR="${CLOUDITY_COMPOSE_DIR:-/tmp/cloudity-build}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ghcr.yml}"
ENV_FILE="${ENV_FILE:-.env}"
PROJECT="${COMPOSE_PROJECT:-cloudity}"
SERVICES=(api-gateway admin-service cloudity-web)

if [[ ! -f "$COMPOSE_DIR/$COMPOSE_FILE" ]]; then
  echo "❌ $COMPOSE_DIR/$COMPOSE_FILE introuvable" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_DIR/$ENV_FILE" ]]; then
  echo "❌ $COMPOSE_DIR/$ENV_FILE introuvable" >&2
  exit 1
fi

cd "$COMPOSE_DIR"
echo "==> Pull ${SERVICES[*]} (project=$PROJECT)…"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull "${SERVICES[@]}"

echo "==> Recreate (no-deps)…"
for c in cloudity-web cloudity-admin-service cloudity-api-gateway; do
  docker rm -f "$c" 2>/dev/null || true
done
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  up -d --no-deps --force-recreate "${SERVICES[@]}"

sleep 5
echo "==> Vérif"
docker exec cloudity-admin-service sh -c 'find /cloudity-repo -name go.mod | wc -l' 2>/dev/null \
  && echo "admin CVE manifests OK" || echo "⚠ admin pas prêt"
docker exec cloudity-web wget -qS -O /dev/null http://127.0.0.1/mobile/crashes 2>&1 | grep HTTP/ || true
docker ps --filter name=cloudity --format 'table {{.Names}}\t{{.Status}}' | grep -E 'web|gateway|admin|NAMES'
