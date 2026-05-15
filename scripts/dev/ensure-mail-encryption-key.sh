#!/usr/bin/env bash
# Garantit une MAIL_PASSWORD_ENCRYPTION_KEY exploitable dans .env (64 hex, non « 64 zéros »).
# Le mail-directory-service refuse decryptPassword avec la clé placeholder — sinon POST …/sync → 400.
#
# Usage : ./scripts/dev/ensure-mail-encryption-key.sh
#         ENV_FILE=.env.production make ensure-mail-encryption-key  (via Makefile)
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
ZERO_KEY='0000000000000000000000000000000000000000000000000000000000000000'

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 64
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE absent — rien à faire (crée .env via make setup / make create-env)."
  exit 0
fi

current=""
if grep -qE '^[[:space:]]*MAIL_PASSWORD_ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null; then
  current="$(grep '^[[:space:]]*MAIL_PASSWORD_ENCRYPTION_KEY=' "$ENV_FILE" | tail -1 | sed 's/^[[:space:]]*MAIL_PASSWORD_ENCRYPTION_KEY=//')"
  current="${current//$'\r'/}"
  current="${current//\"/}"
fi

if [ -n "$current" ] && [ "$current" != "$ZERO_KEY" ] && [ "${#current}" -eq 64 ]; then
  echo "✅ MAIL_PASSWORD_ENCRYPTION_KEY déjà défini ($ENV_FILE)."
  exit 0
fi

NEW_KEY="$(rand_hex)"
TMP="${ENV_FILE}.tmp.$$"
grep -vE '^[[:space:]]*MAIL_PASSWORD_ENCRYPTION_KEY=' "$ENV_FILE" >"$TMP" || true
{
  echo ""
  echo "# Chiffrement des mots de passe IMAP/SMTP (mail-directory-service). Généré par ensure-mail-encryption-key.sh"
  echo "MAIL_PASSWORD_ENCRYPTION_KEY=$NEW_KEY"
} >>"$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "✅ MAIL_PASSWORD_ENCRYPTION_KEY ajoutée/mise à jour dans $ENV_FILE"
echo "   Redémarre le service mail :  docker compose up -d mail-directory-service   (ou  make up )"
