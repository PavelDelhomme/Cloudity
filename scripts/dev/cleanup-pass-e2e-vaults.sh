#!/usr/bin/env bash
# Supprime les coffres Pass créés par Playwright (préfixe de nom « e2e- »).
# Les items sont supprimés en cascade (FK pass_items → pass_vaults).
# Alternative applicative : DELETE /pass/vaults/:id (passwords-service) — utilisé
# par les specs Playwright (e2e/fixtures/pass-cleanup.ts).
#
# Prérequis : stack locale avec Postgres (`make up`).
# Usage (depuis la racine du dépôt) :
#   ./scripts/dev/cleanup-pass-e2e-vaults.sh
#   PASS_E2E_CLEAN_EMAIL=autre@domaine.tld ./scripts/dev/cleanup-pass-e2e-vaults.sh
#
# Convention : ne pas nommer un coffre réel avec un nom qui commence par « e2e- »
# (réservé aux tests automatisés).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${POSTGRES_USER:-cloudity_admin}"
DB_NAME="${POSTGRES_DB:-cloudity}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "$COMPOSE_FILE")
else
  DC=(docker-compose -f "$COMPOSE_FILE")
fi

EMAIL="${PASS_E2E_CLEAN_EMAIL:-admin@cloudity.local}"
if ! [[ "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$ ]]; then
  echo "❌ PASS_E2E_CLEAN_EMAIL invalide : $EMAIL" >&2
  exit 1
fi

# Échappement simple pour littéral SQL (email déjà validé sans quote).
EMAIL_SQL="${EMAIL//\'/''}"

echo "🧹 Coffres Pass dont le nom commence par « e2e- » pour l’utilisateur $EMAIL_SQL …"

SQL=$(cat <<EOF
WITH target AS (
  SELECT id FROM users WHERE lower(email) = lower('$EMAIL_SQL')
),
del AS (
  DELETE FROM pass_vaults v
  USING target t
  WHERE v.user_id = t.id
    AND v.name ILIKE 'e2e-%'
  RETURNING v.id, v.name
)
SELECT coalesce((SELECT count(*)::text FROM del), '0') AS removed_count,
       coalesce((SELECT string_agg(name, ', ' ORDER BY id) FROM del), '') AS removed_names;
EOF
)

OUT="$("${DC[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -t -A -c "$SQL" || true)"
if [ -z "$OUT" ]; then
  echo "❌ Impossible d’exécuter psql (Postgres démarré ? docker compose up -d postgres)" >&2
  exit 1
fi

REMOVED="${OUT%%|*}"
NAMES="${OUT#*|}"
echo "   → Supprimés : $REMOVED coffre(s)."
if [ -n "$NAMES" ] && [ "$NAMES" != "" ]; then
  echo "   → Noms : $NAMES"
fi
echo "✅ Terminé."
