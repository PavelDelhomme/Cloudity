#!/usr/bin/env bash
# Aligne deploy/mail-mta/.env avec le .env racine (MTA_INTERNAL_TOKEN, domaine alias).
# Usage : ./scripts/dev/sync-mail-mta-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT_ENV="${ENV_FILE:-$ROOT/.env}"
MTA_ENV="$ROOT/deploy/mail-mta/.env"
EXAMPLE="$ROOT/deploy/mail-mta/.env.local.example"

read_env() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$file" 2>/dev/null | tail -1 | tr -d '\r"[:space:]'
}

set_env_kv() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^[[:space:]]*${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*" k "=" && done==0 { print k "=" v; done=1; next }
      { print }
    ' "$file" >"${file}.tmp.$$" && mv "${file}.tmp.$$" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >>"$file"
  fi
}

if [ ! -f "$ROOT_ENV" ]; then
  echo "⚠️  $ROOT_ENV absent — lancez make create-env ou make ensure-mta-internal-token."
  exit 1
fi

if [ ! -f "$MTA_ENV" ]; then
  if [ -f "$EXAMPLE" ]; then
    cp "$EXAMPLE" "$MTA_ENV"
    chmod 600 "$MTA_ENV" 2>/dev/null || true
    echo "📄 Créé $MTA_ENV depuis .env.local.example"
  else
    echo "❌ $EXAMPLE introuvable."
    exit 1
  fi
fi

TOKEN="$(read_env MTA_INTERNAL_TOKEN "$ROOT_ENV")"
ALIAS_DOMAIN="$(read_env MAIL_ALIAS_SUBDOMAIN "$ROOT_ENV")"
[ -z "$ALIAS_DOMAIN" ] && ALIAS_DOMAIN="$(read_env MAIL_ALIAS_DOMAIN "$ROOT_ENV")"
[ -z "$ALIAS_DOMAIN" ] && ALIAS_DOMAIN="alias.example.invalid"

if [ -z "$TOKEN" ]; then
  echo "❌ MTA_INTERNAL_TOKEN manquant dans $ROOT_ENV — make ensure-mta-internal-token"
  exit 1
fi

set_env_kv "$MTA_ENV" MTA_INTERNAL_TOKEN "$TOKEN"
set_env_kv "$MTA_ENV" MAIL_ALIAS_DOMAIN "$ALIAS_DOMAIN"
set_env_kv "$MTA_ENV" MADDY_DOMAIN "$ALIAS_DOMAIN"
set_env_kv "$MTA_ENV" MADDY_HOSTNAME "mail.${ALIAS_DOMAIN}"

PORT_MAIL="$(read_env PORT_MAIL_DIRECTORY "$ROOT_ENV")"
[ -z "$PORT_MAIL" ] && PORT_MAIL="6050"
set_env_kv "$MTA_ENV" MAIL_DIRECTORY_URL "http://host.docker.internal:${PORT_MAIL}"
if [ -z "$(read_env RELAY_SMTP_HOST "$MTA_ENV")" ]; then
  set_env_kv "$MTA_ENV" RELAY_SMTP_HOST "host.docker.internal"
fi
if [ -z "$(read_env RELAY_SMTP_PORT "$MTA_ENV")" ]; then
  set_env_kv "$MTA_ENV" RELAY_SMTP_PORT "1025"
fi
if [ -z "$(read_env SMTP_PORT "$MTA_ENV")" ]; then
  set_env_kv "$MTA_ENV" SMTP_PORT "2526"
fi

chmod 600 "$MTA_ENV" 2>/dev/null || true
echo "✅ deploy/mail-mta/.env aligné (domaine=${ALIAS_DOMAIN}, mail-directory=${PORT_MAIL})."
