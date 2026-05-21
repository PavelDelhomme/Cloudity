#!/usr/bin/env bash
# Smoke MTA alias local : token, API alias-resolve, port SMTP (Maddy optionnel).
# Variables optionnelles : ALIAS_TEST_EMAIL=inscriptions@<domaine-alias>
# Usage : ./scripts/dev/test-mail-mta-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

read_env() {
  local key="$1" file="${2:-.env}"
  [ -f "$file" ] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$file" 2>/dev/null | tail -1 | tr -d '\r"[:space:]'
}

PORT_MAIL="${PORT_MAIL_DIRECTORY:-$(read_env PORT_MAIL_DIRECTORY .env)}"
PORT_MAIL="${PORT_MAIL:-6050}"
MAIL_URL="http://127.0.0.1:${PORT_MAIL}"

fail() { echo "❌ $*" >&2; exit 1; }
ok() { echo "✅ $*"; }

echo "=== Test MTA alias local ==="

chmod +x scripts/dev/ensure-mta-internal-token.sh scripts/dev/sync-mail-mta-env.sh 2>/dev/null || true
./scripts/dev/ensure-mta-internal-token.sh
./scripts/dev/sync-mail-mta-env.sh

TOKEN="$(read_env MTA_INTERNAL_TOKEN .env)"
[ -n "$TOKEN" ] || fail "MTA_INTERNAL_TOKEN absent après ensure-mta-internal-token"

if ! curl -fsS --max-time 5 "${MAIL_URL}/health" >/dev/null 2>&1; then
  fail "mail-directory injoignable sur ${MAIL_URL}/health — lancez make up ou make deploy-mail"
fi
ok "mail-directory /health (${MAIL_URL})"

ALIAS_DOMAIN="$(read_env MAIL_ALIAS_SUBDOMAIN .env)"
[ -z "$ALIAS_DOMAIN" ] && ALIAS_DOMAIN="$(read_env MAIL_ALIAS_DOMAIN .env)"
[ -z "$ALIAS_DOMAIN" ] && ALIAS_DOMAIN="alias.example.invalid"

ALIAS_TEST_EMAIL="${ALIAS_TEST_EMAIL:-inscriptions@${ALIAS_DOMAIN}}"
RESOLVE_BODY="$(printf '{"alias_email":"%s"}' "$ALIAS_TEST_EMAIL")"
HTTP_CODE="$(curl -sS -o /tmp/cloudity-alias-resolve.json -w '%{http_code}' --max-time 10 \
  -X POST "${MAIL_URL}/mail/internal/alias-resolve" \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: ${TOKEN}" \
  -d "$RESOLVE_BODY" || echo "000")"

case "$HTTP_CODE" in
  200)
    ok "alias-resolve ${ALIAS_TEST_EMAIL} → $(tr -d '\n' </tmp/cloudity-alias-resolve.json | head -c 120)…"
    ;;
  404)
    echo "🟡 alias-resolve 404 pour ${ALIAS_TEST_EMAIL} — créez l’alias dans Pass/Mail puis relancez (ALIAS_TEST_EMAIL=…)."
    ;;
  401)
    fail "alias-resolve 401 — token MTA incohérent (make deploy-mail après sync-mail-mta-env)"
    ;;
  *)
    fail "alias-resolve HTTP ${HTTP_CODE} — $(cat /tmp/cloudity-alias-resolve.json 2>/dev/null || true)"
    ;;
esac

SMTP_PORT="$(read_env SMTP_PORT deploy/mail-mta/.env)"
[ -z "$SMTP_PORT" ] && SMTP_PORT="$(read_env MAIL_ALIAS_PORT .env)"
SMTP_PORT="${SMTP_PORT:-2526}"

if command -v swaks >/dev/null 2>&1; then
  SWAKS_LOG="$(mktemp)"
  if swaks --to "$ALIAS_TEST_EMAIL" --from "sender@external.example" \
    --server 127.0.0.1 --port "$SMTP_PORT" --timeout 8 >"$SWAKS_LOG" 2>&1; then
    ok "SMTP accepté sur 127.0.0.1:${SMTP_PORT} pour ${ALIAS_TEST_EMAIL} (Maddy → alias-router)"
  elif grep -qE '220 |250 ' "$SWAKS_LOG" 2>/dev/null; then
    ok "Maddy répond sur 127.0.0.1:${SMTP_PORT} (relancez make mail-mta-local-up si RCPT rejeté — domaine .env ≠ MADDY_DOMAIN conteneur)"
    grep -E '550|553|554' "$SWAKS_LOG" 2>/dev/null | tail -3 >&2 || true
  else
    echo "🟡 pas de bannière SMTP sur ${SMTP_PORT} — make mail-mta-local-up"
  fi
  rm -f "$SWAKS_LOG"
elif command -v nc >/dev/null 2>&1; then
  if printf 'QUIT\r\n' | nc -w3 127.0.0.1 "$SMTP_PORT" 2>/dev/null | head -1 | grep -qiE '220|421'; then
    ok "bannière SMTP sur 127.0.0.1:${SMTP_PORT}"
  else
    echo "🟡 pas de service SMTP sur ${SMTP_PORT} — make mail-mta-local-up"
  fi
else
  echo "🟡 installez swaks ou nc pour le smoke SMTP"
fi

if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cloudity-maddy-local$'; then
    ok "conteneur cloudity-maddy-local actif"
  fi
fi

echo ""
echo "Suite manuelle C7 : envoi externe → MX prod ou redirection fournisseur → sync IMAP."
echo "Docs : docs/operations/MAIL-ALIAS-DNS-MADDY.md · docs/produit/MAIL-ALIAS-CHECKLIST.md § C7"
echo "=== Fin test MTA local ==="
