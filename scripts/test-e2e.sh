#!/bin/bash
# Tests E2E : vérifie que les endpoints répondent (stack doit être up: make up)
# Usage: ./scripts/test-e2e.sh

set -e

PORT_GATEWAY="${PORT_GATEWAY:-6080}"
PORT_AUTH="${PORT_AUTH:-6081}"
PORT_ADMIN="${PORT_ADMIN:-6082}"
PORT_PASS="${PORT_PASS:-6051}"
PORT_MAIL="${PORT_MAIL:-6050}"
PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"

echo "🧪 Tests E2E (ports 60XX)..."
failed=0

check() {
  local name="$1"
  local url="$2"
  if curl -sf --connect-timeout 2 "$url" >/dev/null; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name ($url)"
    failed=1
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local key="$3"
  local out
  out=$(curl -sf --connect-timeout 2 "$url" 2>/dev/null) || true
  if [ -z "$out" ]; then
    echo "  ❌ $name ($url)"
    failed=1
    return
  fi
  if echo "$out" | grep -q "\"$key\""; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name (réponse invalide)"
    failed=1
  fi
}

# Réessaie jusqu'à 3 fois (pour laisser le temps au gateway / backends au démarrage)
check_json_retry() {
  local name="$1"
  local url="$2"
  local key="$3"
  local i=1
  while [ $i -le 3 ]; do
    local out
    out=$(curl -sf --connect-timeout 3 "$url" 2>/dev/null) || true
    if [ -n "$out" ] && echo "$out" | grep -q "\"$key\""; then
      echo "  ✅ $name"
      return
    fi
    if [ $i -lt 3 ]; then
      sleep 2
    fi
    i=$((i + 1))
  done
  echo "  ❌ $name ($url)"
  failed=1
}

# Vérifie le code HTTP (fonctionnel)
check_http() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  local extra="${5:-}"
  local code
  code=$(curl -sf -w "%{http_code}" -o /dev/null -X "$method" $extra "$url" 2>/dev/null) || true
  if [ "$code" = "$expected" ]; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name (attendu HTTP $expected, reçu $code)"
    failed=1
  fi
}

check_http_any() {
  local name="$1"
  local method="$2"
  local url="$3"
  local code
  code=$(curl -sf -w "%{http_code}" -o /dev/null -X "$method" "$url" -H "Content-Type: application/json" -d '{"email":"e@e.com","password":"wrong","tenant_id":1}' 2>/dev/null) || true
  if [ "$code" = "401" ] || [ "$code" = "400" ]; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name (attendu 401 ou 400, reçu $code)"
    failed=1
  fi
}

# Services directs
check "API Gateway /health" "http://localhost:${PORT_GATEWAY}/health"
check "Auth Service /health" "http://localhost:${PORT_AUTH}/health"
check "Admin Service /health" "http://localhost:${PORT_ADMIN}/health"
check "Password Manager /health" "http://localhost:${PORT_PASS}/health"
check "Mail Directory /health" "http://localhost:${PORT_MAIL}/health"
check "Dashboard" "http://localhost:${PORT_DASHBOARD}/"

# Via API Gateway (proxy) — avec retry pour /auth et /pass (démarrage possiblement décalé)
check_json "Gateway → health JSON" "http://localhost:${PORT_GATEWAY}/health" "status"
check_json_retry "Gateway → /auth/health" "http://localhost:${PORT_GATEWAY}/auth/health" "status"
check_json "Gateway → /admin/stats" "http://localhost:${PORT_GATEWAY}/admin/stats" "active_tenants"
check_json_retry "Gateway → /pass/health" "http://localhost:${PORT_GATEWAY}/pass/health" "status"
check_json_retry "Gateway → /mail/health" "http://localhost:${PORT_GATEWAY}/mail/health" "status"

# Drive (fichiers / dossiers)
check_json_retry "Gateway → /drive/health" "http://localhost:${PORT_GATEWAY}/drive/health" "status"

# Checks fonctionnels API (auth, validation)
check_http_any "Gateway → POST /auth/login (invalid) → 401 ou 400" "POST" "http://localhost:${PORT_GATEWAY}/auth/login"
check_http "Gateway → GET /auth/validate (no token) → 401" "GET" "http://localhost:${PORT_GATEWAY}/auth/validate" "401"

# Optionnel : login avec compte démo (si seed-admin a été lancé)
demo_login() {
  local out
  out=$(curl -sf -w "\n%{http_code}" -X POST "http://localhost:${PORT_GATEWAY}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@cloudity.local","password":"Admin123!","tenant_id":"1"}' 2>/dev/null) || true
  local code
  code=$(echo "$out" | tail -n1)
  if [ "$code" = "200" ]; then
    echo "  ✅ Gateway → POST /auth/login (démo) → 200"
  else
    echo "  ⏭️  Gateway → POST /auth/login (démo) → skip (compte absent ? make seed-admin)"
  fi
}
demo_login

if [ $failed -eq 1 ]; then
  echo ""
  echo "💡 Assurez-vous que la stack est up : make up"
  echo "   Puis attendez 20-30 s que tous les services soient healthy (docker compose ps)."
  echo "   Le gateway attend auth-service, admin-service, password-manager et mail-directory-service avant de démarrer."
  exit 1
fi
echo ""
echo "✅ E2E OK"
exit 0
