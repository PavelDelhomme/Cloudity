#!/usr/bin/env bash
# Recrée le compte seed admin (SEED_ADMIN_*) et garantit un seul role=admin sur tenant 1.
# Ce compte = apps utilisateur (/app) + back-office (/4dm1n).
# Usage : make seed-admin-reset   (stack up requise)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLOUDITY_REPO_ROOT="$ROOT"

# shellcheck source=scripts/dev/env-get.sh
source "$ROOT/scripts/dev/env-get.sh"

SEED_ADMIN_EMAIL="$(cloudity_env_get SEED_ADMIN_EMAIL)"
SEED_ADMIN_PASSWORD="$(cloudity_env_get SEED_ADMIN_PASSWORD)"
PORT_GATEWAY="$(cloudity_env_get PORT_GATEWAY 6002)"

if [[ -z "$SEED_ADMIN_EMAIL" ]]; then
  echo "❌ SEED_ADMIN_EMAIL manquant dans .env — adresse réelle recommandée (pas admin@cloudity.local)" >&2
  exit 1
fi
if [[ -z "$SEED_ADMIN_PASSWORD" ]]; then
  echo "❌ SEED_ADMIN_PASSWORD manquant dans .env — voir .env.example" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f docker-compose.yml)
else
  COMPOSE=(docker-compose -f docker-compose.yml)
fi

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}
SEED_EMAIL_SQL="$(sql_escape "$SEED_ADMIN_EMAIL")"

echo "🔄 Recréation du compte admin ($SEED_ADMIN_EMAIL) avec le mot de passe .env…"
"${COMPOSE[@]}" exec -T postgres psql -U cloudity_admin -d cloudity -v ON_ERROR_STOP=1 \
  -c "DELETE FROM users WHERE email='${SEED_EMAIL_SQL}' AND tenant_id=1;" \
  >/dev/null 2>&1 || true

payload="$(
  SEED_EMAIL="$SEED_ADMIN_EMAIL" SEED_PASS="$SEED_ADMIN_PASSWORD" python3 - <<'PY'
import json, os
print(json.dumps({
    "email": os.environ["SEED_EMAIL"],
    "password": os.environ["SEED_PASS"],
    "tenant_id": "1",
}))
PY
)"

if ! curl -sf -X POST "http://localhost:${PORT_GATEWAY}/auth/register" \
  -H "Content-Type: application/json" \
  -d "$payload" >/dev/null; then
  echo "❌ Inscription échouée — stack up ? (make up)" >&2
  exit 1
fi

"${COMPOSE[@]}" exec -T postgres psql -U cloudity_admin -d cloudity -v ON_ERROR_STOP=1 \
  -c "UPDATE users SET role='admin' WHERE email='${SEED_EMAIL_SQL}' AND tenant_id=1; UPDATE users SET role='user' WHERE tenant_id=1 AND role='admin' AND email<>'${SEED_EMAIL_SQL}';" >/dev/null

echo "✅ Super-admin unique : $SEED_ADMIN_EMAIL (/app + /4dm1n ; mot de passe = SEED_ADMIN_PASSWORD)"
