#!/usr/bin/env bash
# Garantit un MTA_INTERNAL_TOKEN actif dans .env pour le lookup MTA → Cloudity.
# Si une ligne commentée existe déjà avec une valeur, elle est décommentée.
#
# Usage : ./scripts/dev/ensure-mta-internal-token.sh
#         ENV_FILE=.env.production ./scripts/dev/ensure-mta-internal-token.sh

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

rand_hex_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE absent — rien à faire."
  exit 0
fi

active=""
if sed -n 's/^[[:space:]]*MTA_INTERNAL_TOKEN=//p' "$ENV_FILE" | tail -1 | grep -q .; then
  active="$(sed -n 's/^[[:space:]]*MTA_INTERNAL_TOKEN=//p' "$ENV_FILE" | tail -1 | tr -d '\r"[:space:]')"
fi

if [ -n "$active" ]; then
  echo "✅ MTA_INTERNAL_TOKEN déjà défini ($ENV_FILE)."
  exit 0
fi

commented="$(sed -n 's/^[[:space:]]*#[[:space:]]*MTA_INTERNAL_TOKEN=//p' "$ENV_FILE" | tail -1 | tr -d '\r"[:space:]' || true)"
TMP="${ENV_FILE}.tmp.$$"

if [ -n "$commented" ]; then
  awk '
    BEGIN { done=0 }
    /^[[:space:]]*#[[:space:]]*MTA_INTERNAL_TOKEN=/ && done==0 {
      sub(/^[[:space:]]*#[[:space:]]*/, "")
      done=1
    }
    { print }
  ' "$ENV_FILE" >"$TMP"
  mv "$TMP" "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  echo "✅ MTA_INTERNAL_TOKEN décommenté dans $ENV_FILE"
  exit 0
fi

NEW_TOKEN="$(rand_hex_32)"
cp "$ENV_FILE" "$TMP"
{
  echo ""
  echo "# MTA alias entrant (lookup MTA → Cloudity). Généré par ensure-mta-internal-token.sh"
  echo "MTA_INTERNAL_TOKEN=$NEW_TOKEN"
} >>"$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "✅ MTA_INTERNAL_TOKEN ajouté dans $ENV_FILE"
