#!/usr/bin/env bash
# Génère le bloc Environment variables pour Portainer PROD (secrets frais + URLs prod).
#
# Usage :
#   make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
#   WRITE_STACK_ENV=1 make portainer-prod-env   # écrit aussi deploy/portainer/stack.env
#
# Sortie : stdout KEY=VALUE + fichier .env.prod + optionnel deploy/portainer/stack.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-delhomme.ovh}"
HOST="${HOST:-cloudity.${DOMAIN}}"
API_HOST="${API_HOST:-api.cloudity.${DOMAIN}}"
ADMIN_HOST="${ADMIN_HOST:-admin.cloudity.${DOMAIN}}"
REGISTRY_OWNER="${REGISTRY_OWNER:-paveldelhomme}"
NPM_NETWORK="${NPM_NETWORK:-shared-network-copy}"
WRITE_STACK_ENV="${WRITE_STACK_ENV:-1}"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT/deploy/portainer/stack.env}"

# Sous-domaines web optionnels (CORS + WebAuthn)
APP_SUBDOMAINS="${APP_SUBDOMAINS:-mail drive pass calendar notes tasks contacts photos office}"

build_https_origins() {
  local base="$1"
  shift
  local subs=("$@")
  local out="https://${HOST}"
  local s
  if [[ -n "$ADMIN_HOST" && "$ADMIN_HOST" != "$HOST" ]]; then
    out="${out},https://${ADMIN_HOST}"
  fi
  for s in "${subs[@]}"; do
    out="${out},https://${s}.cloudity.${DOMAIN}"
  done
  printf '%s' "$out"
}

CORS_ORIGINS_VALUE="$(build_https_origins "$HOST" $APP_SUBDOMAINS)"
WEBAUTHN_ORIGINS_VALUE="$CORS_ORIGINS_VALUE"

echo "════════════════════════════════════════════════════════" >&2
echo " Génération .env.prod + secrets prod (CSPRNG)" >&2
echo " Domaine : ${HOST} · API : ${API_HOST}" >&2
echo " CORS    : ${CORS_ORIGINS_VALUE}" >&2
if [[ "${PRESERVE_SECRETS:-}" == "1" ]] || [[ -f "$STACK_ENV_FILE" && "${FORCE_NEW_SECRETS:-}" != "1" ]]; then
  echo " ⚠️  Migration : ne PAS regénérer POSTGRES_PASSWORD/JWT si volumes existent." >&2
  echo "     Utilise le stack.env existant ou PRESERVE_SECRETS=1." >&2
fi
echo "════════════════════════════════════════════════════════" >&2
echo "" >&2

SECRETS="$(./scripts/dev/gen-secrets.sh --print)"
eval "$(echo "$SECRETS" | grep -E '^[A-Z_]+=' | sed 's/^/export /')"

SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)}"

./scripts/dev/env-prepare.sh prod \
  --domain "$DOMAIN" \
  --host "$HOST" \
  --api-host "$API_HOST" \
  --force

{
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "REDIS_PASSWORD=${REDIS_PASSWORD}"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}"
  echo "MAIL_PASSWORD_ENCRYPTION_KEY=${MAIL_PASSWORD_ENCRYPTION_KEY}"
  echo "ALIAS_ENCRYPTION_KEY=${ALIAS_ENCRYPTION_KEY}"
  echo "SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}"
  echo "CORS_ORIGINS=${CORS_ORIGINS_VALUE}"
  echo "WEBAUTHN_ORIGINS=${WEBAUTHN_ORIGINS_VALUE}"
  echo "CLOUDITY_PUBLIC_API_HOST=${API_HOST}"
} >> .env.prod

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
grep -v '^CORS_ORIGINS=' .env.prod | grep -v '^WEBAUTHN_ORIGINS=' > .env.prod.tmp
mv .env.prod.tmp .env.prod
echo "CORS_ORIGINS=${CORS_ORIGINS_VALUE}" >> .env.prod
echo "WEBAUTHN_ORIGINS=${WEBAUTHN_ORIGINS_VALUE}" >> .env.prod

ENV_BLOCK="$(mktemp)"
{
  echo "REGISTRY_OWNER=${REGISTRY_OWNER}"
  echo "TAG=latest"
  echo "NPM_NETWORK=${NPM_NETWORK}"
  ./scripts/dev/portainer-env-print.sh .env.prod
  grep -q '^ACCESS_TOKEN_DURATION_MINUTES=' .env.prod 2>/dev/null || echo "ACCESS_TOKEN_DURATION_MINUTES=60"
} > "$ENV_BLOCK"

if [[ "$WRITE_STACK_ENV" == "1" ]]; then
  mkdir -p "$(dirname "$STACK_ENV_FILE")"
  cp "$ENV_BLOCK" "$STACK_ENV_FILE"
  chmod 600 "$STACK_ENV_FILE"
  echo "📄 Fichier Portainer : ${STACK_ENV_FILE}" >&2
  echo "   Portainer CE → Stack → Environment variables → « Load variables from file » (si dispo)" >&2
  echo "   ou : scp deploy/portainer/stack.env user@vps:/opt/cloudity/stack.env" >&2
fi

echo "" >&2
echo "—— Coller dans Portainer (Advanced environment) ——" >&2
echo "" >&2
cat "$ENV_BLOCK"
rm -f "$ENV_BLOCK"

echo "" >&2
echo "—— Fin du bloc Portainer ——" >&2
echo "Fichier local : .env.prod + ${STACK_ENV_FILE} (gitignored)" >&2
echo "NPM web  : ${HOST} (+ sous-domaines apps) → cloudity-web:80 (HTTPS terminé par NPM)" >&2
echo "NPM API  : ${API_HOST} → cloudity-api-gateway:8000" >&2
echo "⚠️  Ne partage jamais ce bloc (secrets) — regénère si exposé." >&2
