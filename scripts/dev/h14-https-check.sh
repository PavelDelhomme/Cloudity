#!/usr/bin/env bash
# Smoke H14 HTTPS (DNS + TLS + health + CORS) — depuis le PC.
# Usage:
#   ./scripts/dev/h14-https-check.sh
#   WEB=https://cloudity.delhomme.ovh API=https://api.cloudity.delhomme.ovh ./scripts/dev/h14-https-check.sh
set -euo pipefail

WEB="${WEB:-https://cloudity.delhomme.ovh}"
API="${API:-https://api.cloudity.delhomme.ovh}"
WEB_HOST="${WEB#https://}"; WEB_HOST="${WEB_HOST#http://}"; WEB_HOST="${WEB_HOST%%/*}"
API_HOST="${API#https://}"; API_HOST="${API_HOST#http://}"; API_HOST="${API_HOST%%/*}"

ok=0
ko=0
check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  ✅ $name"
    ok=$((ok + 1))
  else
    echo "  ❌ $name"
    ko=$((ko + 1))
  fi
}

echo "H14 HTTPS check"
echo "  WEB=$WEB"
echo "  API=$API"
echo ""

echo "── DNS ──"
check "A $WEB_HOST" bash -c "dig +short '$WEB_HOST' A | grep -qE '^[0-9]'"
check "A $API_HOST" bash -c "dig +short '$API_HOST' A | grep -qE '^[0-9]'"

echo "── TLS (cert LE) ──"
check "cert $WEB_HOST" bash -c "echo | openssl s_client -servername '$WEB_HOST' -connect '$WEB_HOST:443' 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -qi '$WEB_HOST'"
check "cert $API_HOST" bash -c "echo | openssl s_client -servername '$API_HOST' -connect '$API_HOST:443' 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -qi '$API_HOST'"

echo "── HTTP ──"
web_code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 12 "$WEB/" || echo 000)
api_code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 12 "$API/health" || echo 000)
echo "  WEB / → HTTP $web_code (attendu 200 une fois cloudity-web up)"
echo "  API /health → HTTP $api_code (attendu 200 une fois cloudity-api-gateway up)"
if [[ "$web_code" == "200" ]]; then ok=$((ok + 1)); else ko=$((ko + 1)); echo "  ❌ WEB pas encore prêt (502 = NPM OK mais stack absente / mauvais forward)"; fi
if [[ "$api_code" == "200" ]]; then ok=$((ok + 1)); else ko=$((ko + 1)); echo "  ❌ API pas encore prêt"; fi

echo "── CORS preflight ──"
acao=$(curl -sS -D- -o /dev/null --connect-timeout 12 -X OPTIONS "$API/auth/login" \
  -H "Origin: $WEB" \
  -H 'Access-Control-Request-Method: POST' 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2; exit}')
if [[ "$acao" == "$WEB" ]]; then
  echo "  ✅ Access-Control-Allow-Origin=$acao"
  ok=$((ok + 1))
else
  echo "  ❌ CORS Allow-Origin='${acao:-<vide>}' (attendu $WEB) — stack + CORS_ORIGINS Portainer"
  ko=$((ko + 1))
fi

echo ""
echo "Résultat : $ok OK · $ko KO"
echo ""
echo "Si DNS+TLS OK mais 502/500 :"
echo "  1) NPM → Forward = cloudity-web:3000 et cloudity-api-gateway:8000 (pas cloudity:80)"
echo "  2) Portainer : créer stack cloudity + make portainer-env"
echo "  3) Conteneurs web+gateway sur le même réseau Docker que NPM"
exit "$([[ $ko -eq 0 ]] && echo 0 || echo 1)"
