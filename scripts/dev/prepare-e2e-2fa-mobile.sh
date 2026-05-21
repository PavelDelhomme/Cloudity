#!/usr/bin/env bash
# Prépare le compte e2e-2fa@cloudity.local avec 2FA activée (TOTP + codes récup).
# Écrit reports/e2e-2fa-mobile.env (source avant test-mobile-2fa).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

GATEWAY="${CLOUDITY_E2E_GATEWAY:-http://localhost:${CLOUDITY_GATEWAY_PORT:-6080}}"
EMAIL="${CLOUDITY_E2E_2FA_EMAIL:-e2e-2fa@cloudity.local}"
PASSWORD="${CLOUDITY_E2E_2FA_PASSWORD:-E2faTest123!}"
TENANT="${CLOUDITY_E2E_TENANT:-1}"
OUT="${ROOT}/reports/e2e-2fa-mobile.env"

mkdir -p "${ROOT}/reports"
chmod +x scripts/dev/generate-totp.mjs scripts/dev/reset-user-2fa.sh 2>/dev/null || true

echo "🔐 Préparation compte 2FA mobile (${EMAIL})…"
"${ROOT}/scripts/dev/reset-user-2fa.sh" "$EMAIL" "$TENANT" >/dev/null 2>&1 || true
make seed-e2e-2fa >/dev/null

login_json="$(curl -sf -X POST "${GATEWAY}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"tenant_id\":\"${TENANT}\"}")" || {
  echo "❌ Login impossible — make up + gateway ${GATEWAY}"
  exit 1
}

if echo "$login_json" | grep -q '"requires_2fa"'; then
  echo "❌ Compte encore en 2FA sans token — lancer make seed-e2e-2fa"
  exit 1
fi

token="$(node -e "const j=JSON.parse(process.argv[1]);process.stdout.write(j.access_token||'')" "$login_json")"
if [[ -z "$token" ]]; then
  echo "❌ access_token absent : $login_json"
  exit 1
fi

enable_json="$(curl -sf -X POST "${GATEWAY}/auth/2fa/enable" \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"${token}\"}")"

secret="$(node -e "const j=JSON.parse(process.argv[1]);process.stdout.write(j.secret||'')" "$enable_json")"
if [[ -z "$secret" ]]; then
  echo "❌ secret TOTP absent : $enable_json"
  exit 1
fi

code="$(node "${ROOT}/scripts/dev/generate-totp.mjs" "$secret")"
verify_json="$(curl -sf -X POST "${GATEWAY}/auth/2fa/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"tenant_id\":\"${TENANT}\",\"code\":\"${code}\"}")"

recovery="$(node -e "
const j=JSON.parse(process.argv[1]);
const c=(j.recovery_codes||[])[0]||'';
process.stdout.write(c);
" "$verify_json")"

if [[ -z "$recovery" ]]; then
  echo "❌ codes récupération absents : $verify_json"
  exit 1
fi

totp_now="$(node "${ROOT}/scripts/dev/generate-totp.mjs" "$secret")"

cat >"$OUT" <<EOF
# Généré par scripts/dev/prepare-e2e-2fa-mobile.sh — ne pas committer
export CLOUDITY_E2E_EMAIL='${EMAIL}'
export CLOUDITY_E2E_PASSWORD='${PASSWORD}'
export CLOUDITY_E2E_TENANT='${TENANT}'
export CLOUDITY_E2E_TOTP_SECRET='${secret}'
export CLOUDITY_E2E_2FA_CODE='${totp_now}'
export CLOUDITY_E2E_2FA_RECOVERY='${recovery}'
EOF

echo "✅ 2FA activée — variables dans ${OUT}"
