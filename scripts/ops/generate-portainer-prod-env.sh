#!/usr/bin/env bash
# Génère le bloc Environment variables pour Portainer PROD (secrets frais + URLs prod).
#
# Usage :
#   ./scripts/ops/generate-portainer-prod-env.sh
#   DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh ./scripts/ops/generate-portainer-prod-env.sh
#
# Sortie : stdout KEY=VALUE (copier dans Portainer → Stack cloudity → Environment variables → Advanced)
# Fichier local (gitignored) : .env.prod
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-delhomme.ovh}"
HOST="${HOST:-cloudity.${DOMAIN}}"
API_HOST="${API_HOST:-api.cloudity.${DOMAIN}}"
REGISTRY_OWNER="${REGISTRY_OWNER:-PavelDelhomme}"
NPM_NETWORK="${NPM_NETWORK:-nginx-proxy-manager_npm-network}"

echo "════════════════════════════════════════════════════════" >&2
echo " Génération .env.prod + secrets prod (CSPRNG)" >&2
echo " Domaine : ${HOST} · API : ${API_HOST}" >&2
echo "════════════════════════════════════════════════════════" >&2
echo "" >&2

# Secrets prod robustes (ne pas réutiliser les mots de passe dev du .env local)
SECRETS="$(./scripts/dev/gen-secrets.sh --print)"
eval "$(echo "$SECRETS" | grep -E '^[A-Z_]+=' | sed 's/^/export /')"

# Fusion .env.example + overlays prod + sync URLs publiques
./scripts/dev/env-prepare.sh prod \
  --domain "$DOMAIN" \
  --host "$HOST" \
  --api-host "$API_HOST" \
  --force

# Écrase les secrets faibles hérités du .env dev
{
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "REDIS_PASSWORD=${REDIS_PASSWORD}"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}"
  echo "MAIL_PASSWORD_ENCRYPTION_KEY=${MAIL_PASSWORD_ENCRYPTION_KEY}"
  echo "ALIAS_ENCRYPTION_KEY=${ALIAS_ENCRYPTION_KEY}"
} >> .env.prod

# Dédupliquer (dernière valeur gagne)
awk -F= '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  /^[A-Za-z_][A-Za-z0-9_]*=/ {
    k=$1; sub(/^[[:space:]]*/, "", k); sub(/[[:space:]]+$/, "", k)
    $1=""; sub(/^=/, "", $0)
    v=$0; gsub(/^[[:space:]]+/, "", v)
    a[k]=v; o[++n]=k
  }
  END {
    for (i=1;i<=n;i++) { k=o[i]; if (!(k in p)) { print k"="a[k]; p[k]=1 } }
  }
' .env.prod > .env.prod.tmp && mv .env.prod.tmp .env.prod

./scripts/dev/sync-public-urls.sh .env.prod 2>/dev/null || true

echo "" >&2
echo "—— Coller dans Portainer (Advanced environment) ——" >&2
echo "" >&2

# Variables obligatoires pour docker-compose.ghcr.yml + stack
cat <<EOF
REGISTRY_OWNER=${REGISTRY_OWNER}
TAG=latest
NPM_NETWORK=${NPM_NETWORK}
EOF

./scripts/dev/portainer-env-print.sh .env.prod

# Clés minimales requises par le compose (rappel si absentes)
grep -q '^ACCESS_TOKEN_DURATION_MINUTES=' .env.prod 2>/dev/null || echo "ACCESS_TOKEN_DURATION_MINUTES=60"

echo "" >&2
echo "—— Fin du bloc Portainer ——" >&2
echo "Fichier local sauvé : .env.prod (gitignored)" >&2
echo "NPM : ${HOST} → cloudity-web:3000 · ${API_HOST} → cloudity-api-gateway:8000" >&2
