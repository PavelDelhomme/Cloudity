#!/usr/bin/env bash
# Smoke test production Cloudity (VPS) — endpoints publics + admin JWT.
# Usage : ./scripts/ops/smoke-prod-extended.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="${SMOKE_APP_URL:-https://cloudity.delhomme.ovh}"
API="${SMOKE_API_URL:-https://api.cloudity.delhomme.ovh}"
PASS_FILE="${SMOKE_PASS_FILE:-$ROOT/deploy/portainer/stack.env}"
OK=0
KO=0

check() {
  local label="$1" code="$2" expect="${3:-200}"
  if [[ "$code" == "$expect" ]]; then
    echo "  ✅ $label ($code)"
    OK=$((OK + 1))
  else
    echo "  ❌ $label (HTTP $code, attendu $expect)" >&2
    KO=$((KO + 1))
  fi
}

echo "Smoke prod étendu"
echo "  WEB=$WEB"
echo "  API=$API"
echo ""

echo "── Public ──"
check "API /health" "$(curl -sS -o /dev/null -w '%{http_code}' "$API/health")"
check "WEB /" "$(curl -sS -o /dev/null -w '%{http_code}' "$WEB/")"
check "WEB /login" "$(curl -sS -o /dev/null -w '%{http_code}' "$WEB/login")"
check "WEB /4dm1n" "$(curl -sS -o /dev/null -w '%{http_code}' "$WEB/4dm1n")"
check "OTA manifest mail" "$(curl -sS -o /dev/null -w '%{http_code}' "$API/deploy/mobile/manifest?app=cloudity_mail")"
check "WEB proxy /mobile" "$(curl -sS -o /dev/null -w '%{http_code}' "$WEB/mobile/crashes")" "401"
check "WEB proxy /deploy" "$(curl -sS -o /dev/null -w '%{http_code}' "$WEB/deploy/mobile/manifest?app=cloudity_mail")"

if [[ -f "$PASS_FILE" ]]; then
  PASS="$(grep '^SEED_ADMIN_PASSWORD=' "$PASS_FILE" | cut -d= -f2-)"
  JWT="$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"paul@delhomme.ovh\",\"password\":\"$PASS\",\"tenant_id\":\"1\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')" || JWT=""
  if [[ -n "$JWT" ]]; then
    echo ""
    echo "── Admin JWT (same-origin WEB) ──"
    AUTH_HDR=(-H "Authorization: Bearer $JWT" -H "Origin: $WEB")
    check "releases OTA" "$(curl -sS -o /dev/null -w '%{http_code}' "${AUTH_HDR[@]}" "$WEB/admin/mobile/releases")"
    check "mobile crashes list" "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $JWT" "$API/mobile/crashes")"
    pkg="$(curl -sf "${AUTH_HDR[@]}" "$WEB/admin/security/cve-report?refresh=1" \
      | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("packages_scanned",0))' 2>/dev/null || echo 0)"
    if [[ "${pkg:-0}" -gt 100 ]]; then
      echo "  ✅ CVE scan ($pkg paquets)"
      OK=$((OK + 1))
    else
      echo "  ❌ CVE scan ($pkg paquets)" >&2
      KO=$((KO + 1))
    fi
  else
    echo "  ⚠️  Login admin KO — skip tests JWT"
  fi
fi

echo ""
echo "Résultat : $OK OK · $KO KO"
[[ "$KO" -eq 0 ]]
