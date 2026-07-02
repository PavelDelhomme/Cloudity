#!/bin/bash
# Tests E2E : vérifie que les endpoints répondent (stack doit être up: make up)
# Usage: ./scripts/ci/test-e2e.sh

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLOUDITY_REPO_ROOT="$ROOT"

chmod +x "$ROOT/scripts/dev/env-get.sh" 2>/dev/null || true
# shellcheck source=scripts/dev/env-get.sh
source "$ROOT/scripts/dev/env-get.sh"
SEED_ADMIN_EMAIL="$(cloudity_env_get SEED_ADMIN_EMAIL admin@cloudity.local)"
SEED_ADMIN_PASSWORD="$(cloudity_env_get SEED_ADMIN_PASSWORD)"

# shellcheck source=scripts/ci/test-log-capture.inc.sh
source "$ROOT/scripts/ci/test-log-capture.inc.sh"
[ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "e2e"

PORT_GATEWAY="${PORT_GATEWAY:-6002}"
PORT_AUTH="${PORT_AUTH:-6003}"
PORT_ADMIN="${PORT_ADMIN:-6004}"
PORT_PASS="${PORT_PASS:-6006}"
PORT_MAIL="${PORT_MAIL:-6005}"
PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"

echo "🧪 Tests E2E (ports 60XX)..."
cloudity_test_logs_summary_line
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

check_json_headers() {
  local name="$1"
  local url="$2"
  local key="$3"
  shift 3
  local out
  out=$(curl -sf --connect-timeout 2 "$@" "$url" 2>/dev/null) || true
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

mkdir -p "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e"
{
  echo "=== E2E curl checks ==="
  echo "started_at: $(date -Iseconds)"
} > "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"

check "API Gateway /health" "http://localhost:${PORT_GATEWAY}/health" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"
check "Auth Service /health" "http://localhost:${PORT_AUTH}/health" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"
check "Admin Service /health" "http://localhost:${PORT_ADMIN}/health" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"
check "Password Manager /health" "http://localhost:${PORT_PASS}/health" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"
check "Mail Directory /health" "http://localhost:${PORT_MAIL}/health" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"
check "Dashboard" "http://localhost:${PORT_DASHBOARD}/" | tee -a "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"

check_json "Gateway → health JSON" "http://localhost:${PORT_GATEWAY}/health" "status"
check_json_retry "Gateway → /auth/health" "http://localhost:${PORT_GATEWAY}/auth/health" "status"
check_json_retry "Gateway → /pass/health" "http://localhost:${PORT_GATEWAY}/pass/health" "status"
check_json_retry "Gateway → /mail/health" "http://localhost:${PORT_GATEWAY}/mail/health" "status"
check_json_retry "Gateway → /drive/health" "http://localhost:${PORT_GATEWAY}/drive/health" "status"

check_http_any "Gateway → POST /auth/login (invalid) → 401 ou 400" "POST" "http://localhost:${PORT_GATEWAY}/auth/login"
check_http "Gateway → GET /auth/validate (no token) → 401" "GET" "http://localhost:${PORT_GATEWAY}/auth/validate" "401"

E2E_DASHBOARD_ORIGIN="${E2E_DASHBOARD_ORIGIN:-http://localhost:${PORT_DASHBOARD}}"
E2E_ADMIN_ACCESS_TOKEN=""
demo_login() {
  local out
  if [ -z "$SEED_ADMIN_PASSWORD" ]; then
    echo "  ⏭️  Gateway → POST /auth/login (démo) → skip (SEED_ADMIN_PASSWORD absent du .env)"
    return
  fi
  out=$(curl -sf -w "\n%{http_code}" -X POST "http://localhost:${PORT_GATEWAY}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(SEED_EMAIL="$SEED_ADMIN_EMAIL" SEED_PASS="$SEED_ADMIN_PASSWORD" python3 -c 'import json,os; print(json.dumps({"email":os.environ["SEED_EMAIL"],"password":os.environ["SEED_PASS"],"tenant_id":"1"}))')" 2>/dev/null) || true
  local code
  code=$(echo "$out" | tail -n1)
  if [ "$code" = "200" ]; then
    echo "  ✅ Gateway → POST /auth/login (démo) → 200"
    E2E_ADMIN_ACCESS_TOKEN="$(printf '%s' "$out" | sed '$d' | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
  else
    echo "  ⏭️  Gateway → POST /auth/login (démo) → skip (compte absent ? make seed-admin)"
  fi
}
demo_login

if [ -n "$E2E_ADMIN_ACCESS_TOKEN" ]; then
  check_json_headers "Gateway → /admin/stats (JWT+Origin)" \
    "http://localhost:${PORT_GATEWAY}/admin/stats" "active_tenants" \
    -H "Origin: ${E2E_DASHBOARD_ORIGIN}" \
    -H "Authorization: Bearer ${E2E_ADMIN_ACCESS_TOKEN}"
else
  echo "  ⏭️  Gateway → /admin/stats → skip (pas de JWT admin — lancer make seed-admin)"
fi

cloudity_test_log_redact_file "${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/command-output.log"

if cloudity_test_should_capture "$failed"; then
  cloudity_test_capture_stack_logs "phase2-e2e"
fi

cloudity_test_manifest_event "{\"event\":\"e2e_done\",\"exit_code\":${failed},\"at\":\"$(date -Iseconds)\"}"

if [ $failed -eq 1 ]; then
  echo ""
  echo "💡 Assurez-vous que la stack est up : make up"
  echo "   Puis attendez 20-30 s que tous les services soient healthy (docker compose ps)."
  echo "   Logs conteneurs : ${CLOUDITY_TEST_LOGS_DIR}/phase2-e2e/"
  exit 1
fi
echo ""
echo "✅ E2E OK"
cloudity_test_logs_summary_line
exit 0
