#!/usr/bin/env bash
# Garantit une ALIAS_ENCRYPTION_KEY non vide dans .env (32 octets aléatoires, base64).
# Usage VPS / prod : aligné avec docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md.
# Le mail-directory-service ne lit pas encore cette variable en dev local ; elle est
# passée dans Compose pour parité avec la prod et futurs champs chiffrés alias.
#
# Usage : ./scripts/dev/ensure-alias-encryption-key.sh
#         ENV_FILE=.env.production ./scripts/dev/ensure-alias-encryption-key.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

rand_b64_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64 -w0 2>/dev/null || head -c 32 /dev/urandom | base64
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE absent — rien à faire."
  exit 0
fi

current=""
if grep -qE '^[[:space:]]*ALIAS_ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null; then
  current="$(grep '^[[:space:]]*ALIAS_ENCRYPTION_KEY=' "$ENV_FILE" | tail -1 | sed 's/^[[:space:]]*ALIAS_ENCRYPTION_KEY=//')"
  current="${current//$'\r'/}"
  current="${current//\"/}"
  current="$(echo -n "$current" | tr -d '[:space:]')"
fi

if [ -n "$current" ]; then
  echo "✅ ALIAS_ENCRYPTION_KEY déjà défini ($ENV_FILE)."
  exit 0
fi

NEW_KEY="$(rand_b64_32)"
TMP="${ENV_FILE}.tmp.$$"
grep -vE '^[[:space:]]*ALIAS_ENCRYPTION_KEY=' "$ENV_FILE" >"$TMP" || true
{
  echo ""
  echo "# Chiffrement futur / parité VPS (alias mail). Généré par ensure-alias-encryption-key.sh"
  echo "ALIAS_ENCRYPTION_KEY=$NEW_KEY"
} >>"$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "✅ ALIAS_ENCRYPTION_KEY ajoutée dans $ENV_FILE"
echo "   (Le backend ne l’exploite pas encore partout — voir BACKLOG / DEPLOIEMENT-VPS.)"
