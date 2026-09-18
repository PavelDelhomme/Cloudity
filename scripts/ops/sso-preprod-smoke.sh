#!/usr/bin/env bash
# sso-preprod-smoke.sh — vérifie les routes identity côté Cloudity auth (préprod).
# Ne touche PAS YTMusic / Gasoil / JobbingTrack.
#
# Usage :
#   AUTH_BASE=http://127.0.0.1:6003 ./scripts/ops/sso-preprod-smoke.sh
#   AUTH_BASE=https://api.cloudity-preprod.example ./scripts/ops/sso-preprod-smoke.sh
#
# Attendu :
#   CLOUDITY_SSO_ENABLED=0 → HTTP 404 sur /auth/identity/link
#   CLOUDITY_SSO_ENABLED=1 → 401 sans Bearer (route vivante)
set -euo pipefail

AUTH_BASE="${AUTH_BASE:-http://127.0.0.1:6003}"
AUTH_BASE="${AUTH_BASE%/}"

echo "==> SSO smoke Cloudity-only  AUTH_BASE=$AUTH_BASE"
code="$(curl -sS -o /tmp/cloudity-sso-smoke.json -w '%{http_code}' \
  -X POST "$AUTH_BASE/auth/identity/link" \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"ytmusic","external_user_id":"smoke","email":"smoke@example.com"}' || echo 000)"

echo "POST /auth/identity/link → HTTP $code"
head -c 400 /tmp/cloudity-sso-smoke.json 2>/dev/null; echo

case "$code" in
  404)
    echo "OK — SSO désactivé (CLOUDITY_SSO_ENABLED off). Comportement sûr."
    ;;
  401)
    echo "OK — SSO activé : route vivante, Bearer requis (préprod attendu)."
    ;;
  000)
    echo "❌ auth-service injoignable." >&2
    exit 1
    ;;
  *)
    echo "⚠️  Code inattendu $code — vérifier logs auth-service + migration 50-identity-app-links." >&2
    exit 1
    ;;
esac
