#!/usr/bin/env bash
# Batterie de tests — remontée erreurs mobile + suite UI (sans integration_test ADB).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/mobile/mobile-flutter-env.sh
source "${ROOT}/scripts/mobile/mobile-flutter-env.sh"
# shellcheck source=scripts/dev/env-get.sh
source "${ROOT}/scripts/dev/env-get.sh"

REPORT_DIR="${ROOT}/reports/test-logs/mobile-error-battery-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR"
SUMMARY="${REPORT_DIR}/SUMMARY.md"
FAIL=0

log() { echo "$*" | tee -a "${REPORT_DIR}/run.log"; }
pass() { log "✅ $*"; echo "- ✅ $*" >> "$SUMMARY"; }
fail() { log "❌ $*"; echo "- ❌ $*" >> "$SUMMARY"; FAIL=1; }
skip() { log "⏭️  $*"; echo "- ⏭️ $*" >> "$SUMMARY"; }

echo "# Batterie tests mobile-error-reporting — $(date -Iseconds)" > "$SUMMARY"

cloudity_prepare_flutter_env "$ROOT" || { fail "Flutter SDK Cloudity indisponible"; exit 1; }
pass "Flutter SDK: $(flutter --version | head -1)"

# --- Go api-gateway (toute la suite) ---
log "=== Go: api-gateway ==="
if (cd "${ROOT}/backend/api-gateway" && go test -count=1 -v . > "${REPORT_DIR}/go-api-gateway.log" 2>&1); then
  pass "go test api-gateway (suite complète)"
else
  fail "go test api-gateway — voir ${REPORT_DIR}/go-api-gateway.log"
fi

# --- Go internalsec ---
log "=== Go: internalsec ==="
if (cd "${ROOT}/backend/internalsec" && go test -count=1 . > "${REPORT_DIR}/go-internalsec.log" 2>&1); then
  pass "go test internalsec"
else
  fail "go test internalsec — voir ${REPORT_DIR}/go-internalsec.log"
fi

# --- Flutter unit + analyze (pas d'ADB) ---
MOBILE_PKGS=(cloudity_shared mail drive photos pass admin_app calendar contacts notes tasks)
for pkg in "${MOBILE_PKGS[@]}"; do
  APP_DIR="${ROOT}/mobile/${pkg}"
  [[ -d "$APP_DIR" ]] || continue
  log "=== Flutter: $pkg ==="
  (
    cd "$APP_DIR"
    flutter pub get > "${REPORT_DIR}/flutter-${pkg}-pubget.log" 2>&1
    if [[ -d test ]]; then
      flutter test > "${REPORT_DIR}/flutter-${pkg}-test.log" 2>&1
    else
      echo "no test/" > "${REPORT_DIR}/flutter-${pkg}-test.log"
    fi
    dart analyze lib > "${REPORT_DIR}/flutter-${pkg}-analyze.log" 2>&1 || true
  ) && {
    if [[ -d "${APP_DIR}/test" ]]; then
      pass "flutter test $pkg"
    else
      skip "flutter test $pkg (pas de test/)"
    fi
    if rg -q "^  error " "${REPORT_DIR}/flutter-${pkg}-analyze.log" 2>/dev/null; then
      fail "dart analyze $pkg — erreurs dans flutter-${pkg}-analyze.log"
    else
      pass "dart analyze $pkg"
    fi
  } || fail "flutter $pkg — voir logs dans ${REPORT_DIR}/"
done

# --- API gateway mobile/crashes (live stack) ---
log "=== API: /mobile/crashes ==="
GW="http://127.0.0.1:${PORT_GATEWAY:-6002}"
if curl -sf "${GW}/health" >/dev/null 2>&1; then
  pass "gateway health OK"

  # POST valide
  POST_BODY='{"crashType":"ManualReport","product":"mail","message":"battery test valid"}'
  POST_RES="$(curl -s -w '\n%{http_code}' -X POST "${GW}/mobile/crashes" -H 'Content-Type: application/json' -d "$POST_BODY")"
  POST_CODE="${POST_RES##*$'\n'}"
  POST_JSON="${POST_RES%$'\n'*}"
  echo "$POST_JSON" > "${REPORT_DIR}/api-post-valid.json"
  if [[ "$POST_CODE" == "201" ]] && echo "$POST_JSON" | rg -q '"status":"saved"'; then
    pass "POST /mobile/crashes valide → 201"
    CRASH_ID="$(echo "$POST_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
  else
    fail "POST /mobile/crashes valide → ${POST_CODE} (attendu 201)"
    CRASH_ID=""
  fi

  # POST invalide
  EMPTY_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${GW}/mobile/crashes" -H 'Content-Type: application/json' -d '')"
  [[ "$EMPTY_CODE" == "400" ]] && pass "POST /mobile/crashes vide → 400" || fail "POST vide → ${EMPTY_CODE} (attendu 400)"

  BADJSON_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${GW}/mobile/crashes" -H 'Content-Type: application/json' --data-binary '{bad}')"
  [[ "$BADJSON_CODE" == "400" ]] && pass "POST /mobile/crashes JSON invalide → 400" || fail "POST JSON invalide → ${BADJSON_CODE} (attendu 400)"

  # GET sans auth
  UNAUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${GW}/mobile/crashes")"
  [[ "$UNAUTH_CODE" == "401" ]] && pass "GET /mobile/crashes sans JWT → 401" || fail "GET sans JWT → ${UNAUTH_CODE}"

  # GET avec admin JWT
  ADMIN_EMAIL="$(cloudity_env_get SEED_ADMIN_EMAIL admin@cloudity.local)"
  ADMIN_PASS="$(cloudity_env_get SEED_ADMIN_PASSWORD)"
  if [[ -n "$ADMIN_PASS" ]]; then
    LOGIN_RES="$(curl -s -X POST "${GW}/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\",\"tenant_id\":\"1\"}")"
    echo "$LOGIN_RES" > "${REPORT_DIR}/api-admin-login.json"
    TOKEN="$(echo "$LOGIN_RES" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
    if [[ -z "$TOKEN" ]]; then
      TOKEN="$(echo "$LOGIN_RES" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
    fi
    if [[ -n "$TOKEN" ]]; then
      LIST_RES="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${TOKEN}" "${GW}/mobile/crashes")"
      LIST_CODE="${LIST_RES##*$'\n'}"
      LIST_JSON="${LIST_RES%$'\n'*}"
      echo "$LIST_JSON" > "${REPORT_DIR}/api-list-admin.json"
      [[ "$LIST_CODE" == "200" ]] && pass "GET /mobile/crashes admin JWT → 200" || fail "GET admin → ${LIST_CODE}"

      if [[ -n "$CRASH_ID" ]]; then
        DETAIL_CODE="$(curl -s -o "${REPORT_DIR}/api-detail-admin.json" -w '%{http_code}' \
          -H "Authorization: Bearer ${TOKEN}" \
          "${GW}/mobile/crashes/detail?id=${CRASH_ID}")"
        [[ "$DETAIL_CODE" == "200" ]] && pass "GET /mobile/crashes/detail admin → 200" || fail "GET detail → ${DETAIL_CODE}"
      fi

      # JWT non-admin refusé (token valide mais rôle user si dispo — skip si pas de compte)
    else
      fail "Login admin pour tests API — token absent (seed-admin ?)"
    fi
  else
    skip "GET admin JWT — SEED_ADMIN_PASSWORD vide dans .env"
  fi
else
  skip "API live — gateway down (${GW}/health)"
fi

# --- Frontend build check ---
log "=== Frontend: build cloudity-web ==="
WEB_DIR="${ROOT}/frontend/apps/cloudity-web"
if [[ -f "${WEB_DIR}/package.json" ]]; then
  if (cd "${ROOT}/frontend" && npm run -w @cloudity/web build > "${REPORT_DIR}/frontend-build.log" 2>&1); then
    pass "npm run build @cloudity/web"
  else
    fail "build @cloudity/web — voir frontend-build.log"
  fi
fi

# --- Playwright admin smoke (stack up) ---
log "=== E2E Playwright: admin ==="
if curl -sf "${GW}/health" >/dev/null 2>&1 && [[ -f "${WEB_DIR}/e2e/admin.spec.ts" ]]; then
  if (cd "${WEB_DIR}" && BASE_URL="http://127.0.0.1:${PORT_WEB:-6001}" \
    npx playwright test e2e/admin.spec.ts --reporter=line > "${REPORT_DIR}/playwright-admin.log" 2>&1); then
    pass "playwright e2e/admin.spec.ts"
  else
    fail "playwright admin — voir playwright-admin.log"
  fi
else
  skip "playwright admin (stack ou spec absent)"
fi

log ""
log "=== FIN — rapport: ${SUMMARY} ==="
if [[ "$FAIL" -ne 0 ]]; then
  log "RÉSULTAT GLOBAL: ÉCHEC"
  exit 1
fi
log "RÉSULTAT GLOBAL: OK"
exit 0
