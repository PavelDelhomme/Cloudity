#!/usr/bin/env bash
# Mise à jour individuelle d’un service Cloudity sur le VPS (SSH).
# Usage :
#   ./scripts/deploy/vps-compose-service.sh auth-service
#   ./scripts/deploy/vps-compose-service.sh cloudity-web
#   SERVICES="auth-service api-gateway" ./scripts/deploy/vps-compose-service.sh
#
# Prérequis : DEPLOY_SSH=pavel-server (ou user@host) dans l’env / .env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

TARGET="${DEPLOY_SSH:-pavel-server}"
COMPOSE_DIR="${CLOUDITY_VPS_COMPOSE_DIR:-/tmp/cloudity-build}"
COMPOSE_FILE="${CLOUDITY_VPS_COMPOSE_FILE:-docker-compose.ghcr.yml}"
PROJECT="${CLOUDITY_COMPOSE_PROJECT:-cloudity}"
ENV_FILE="${CLOUDITY_VPS_ENV_FILE:-.env}"

SERVICES="${SERVICES:-$*}"
SERVICES="${SERVICES#"${SERVICES%%[![:space:]]*}"}"
if [[ -z "$SERVICES" ]]; then
  echo "Usage: $0 <service> [service…]" >&2
  echo "Exemples: auth-service | api-gateway | cloudity-web | calendar-service" >&2
  exit 1
fi

echo "==> VPS $TARGET — pull+up (no-deps) : $SERVICES"
# shellcheck disable=SC2029
ssh -o BatchMode=yes -o ConnectTimeout=15 "$TARGET" \
  "cd '$COMPOSE_DIR' && docker compose -p '$PROJECT' -f '$COMPOSE_FILE' --env-file '$ENV_FILE' pull $SERVICES && docker compose -p '$PROJECT' -f '$COMPOSE_FILE' --env-file '$ENV_FILE' up -d --no-deps --remove-orphans $SERVICES"
echo "✅ Services à jour : $SERVICES"
