#!/usr/bin/env bash
# Remet à zéro la 2FA d'un utilisateur (dev / E2E uniquement).
# Usage : ./scripts/dev/reset-user-2fa.sh [email]
# Prérequis : stack Docker up (postgres accessible via compose).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EMAIL="${1:-e2e-2fa@cloudity.local}"
TENANT_ID="${2:-1}"

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker requis."
  exit 1
fi

COMPOSE="${COMPOSE:-docker compose}"
if [ -f docker-compose.yml ]; then
  COMPOSE_FILES="-f docker-compose.yml"
elif [ -f compose.yml ]; then
  COMPOSE_FILES="-f compose.yml"
else
  echo "❌ docker-compose.yml introuvable à la racine."
  exit 1
fi

echo "🔐 Reset 2FA pour ${EMAIL} (tenant ${TENANT_ID})…"
$COMPOSE $COMPOSE_FILES exec -T postgres psql -U cloudity_admin -d cloudity -v ON_ERROR_STOP=1 <<SQL
DELETE FROM recovery_codes
WHERE user_id IN (
  SELECT id FROM users WHERE email = '${EMAIL}' AND tenant_id = ${TENANT_ID}
);
UPDATE users
SET totp_secret = NULL, is_2fa_enabled = false
WHERE email = '${EMAIL}' AND tenant_id = ${TENANT_ID};
SQL

echo "✅ 2FA désactivée pour ${EMAIL}."
