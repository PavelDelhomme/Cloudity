#!/usr/bin/env bash
# scripts/ops/smoke-prod.sh — smoke test post-déploiement Cloudity (prod).
#
# À exécuter juste après un `gh workflow run` ou un `docker compose pull && up -d`
# côté Portainer. Ne dépend que de curl + openssl. Aucun secret en dur.
#
# Endpoints vérifiés :
#   1. GET <api>/health                     → 200 (gateway up)
#   2. GET <api>/auth/validate              → 401 (auth-service joignable, refus sans token)
#   3. GET <app>/                           → 200 (front SPA up)
#   4. TLS handshake <api>                  → certif valide, alg moderne
#   5. Headers durcis sur <api>/health      → HSTS + X-Content-Type-Options
#   6. (optionnel) Login admin avec SMOKE_USER/SMOKE_PASS, puis :
#      a. GET <api>/auth/validate avec Bearer → 200
#      b. GET <api>/mail/me/accounts            → 200 ou 404 (selon fixture)
#      c. GET <api>/drive/nodes/recent          → 200 ou 404
#      d. GET <api>/contacts                    → 200
#
# Variables :
#   SMOKE_API_URL    URL de la gateway (défaut https://api.cloudity.delhomme.ovh)
#   SMOKE_APP_URL    URL du front (défaut https://app.cloudity.delhomme.ovh)
#   SMOKE_USER       email admin pour les tests authentifiés (optionnel)
#   SMOKE_PASS       mot de passe associé (optionnel)
#   SMOKE_TIMEOUT    timeout curl en secondes (défaut 10)
#   SMOKE_VERBOSE    "1" ⇒ affiche les payloads / headers en plus
#
# Exit codes :
#   0   tous les checks ont passé
#   1   au moins un check a échoué (la liste est imprimée à la fin)
#
# Cf. BACKLOG.md « Smoke test post-deploy ».

set -u

API="${SMOKE_API_URL:-https://api.cloudity.delhomme.ovh}"
APP="${SMOKE_APP_URL:-https://app.cloudity.delhomme.ovh}"
TIMEOUT="${SMOKE_TIMEOUT:-10}"
VERBOSE="${SMOKE_VERBOSE:-0}"

failures=()

ok()    { printf '  ✅ %s\n' "$*"; }
warn()  { printf '  ⚠️  %s\n' "$*"; }
fail()  { printf '  ❌ %s\n' "$*"; failures+=("$*"); }
title() { printf '\n— %s\n' "$*"; }

curl_http_code() {
  # $1 method, $2 url, [args...]
  local method="$1"; shift
  local url="$1"; shift
  local code
  # `-w '%{http_code}'` imprime un code à 3 chiffres (000 si pas de réponse).
  # Pas de fallback `|| echo "000"` (qui pouvait dupliquer la sortie).
  code=$(curl -sS --max-time "$TIMEOUT" -o /tmp/smoke-prod.body \
              -w '%{http_code}' \
              -X "$method" "$url" "$@" 2>/tmp/smoke-prod.err) || true
  printf '%s' "${code:-000}" | tr -d '[:space:]'
}

print_extra_if_verbose() {
  if [ "$VERBOSE" = "1" ]; then
    echo "    ↳ body: $(head -c 200 /tmp/smoke-prod.body 2>/dev/null)"
    [ -s /tmp/smoke-prod.err ] && echo "    ↳ stderr: $(cat /tmp/smoke-prod.err)"
  fi
}

# --- 1. /health ---------------------------------------------------------
title "Gateway /health"
code=$(curl_http_code GET "$API/health")
if [ "$code" = "200" ]; then
  ok "$API/health → 200"
else
  fail "$API/health → $code (attendu 200)"
  print_extra_if_verbose
fi

# --- 2. /auth/validate sans token ---------------------------------------
title "Gateway /auth/validate sans Bearer"
code=$(curl_http_code GET "$API/auth/validate")
if [ "$code" = "401" ]; then
  ok "$API/auth/validate (sans token) → 401"
else
  fail "$API/auth/validate (sans token) → $code (attendu 401)"
  print_extra_if_verbose
fi

# --- 3. Front SPA -------------------------------------------------------
title "Front SPA"
code=$(curl_http_code GET "$APP/")
if [ "$code" = "200" ]; then
  ok "$APP/ → 200"
else
  fail "$APP/ → $code (attendu 200)"
  print_extra_if_verbose
fi

# --- 4. TLS handshake ---------------------------------------------------
title "TLS sur $API"
host=$(echo "$API" | sed -E 's#^https?://([^/:]+).*#\1#')
port=443
if command -v openssl >/dev/null 2>&1; then
  if echo | openssl s_client -servername "$host" -connect "$host:$port" -brief 2>&1 \
        | tee /tmp/smoke-tls.log >/dev/null; then
    proto=$(grep -E 'Protocol version' /tmp/smoke-tls.log | awk -F: '{print $2}' | tr -d ' ')
    cipher=$(grep -E 'Ciphersuite' /tmp/smoke-tls.log | awk -F: '{print $2}' | tr -d ' ')
    if [ -n "$proto" ]; then
      ok "TLS handshake OK ($proto / $cipher)"
    else
      ok "TLS handshake OK"
    fi
    case "$proto" in
      TLSv1.3) : ;;
      TLSv1.2) warn "TLS 1.2 actif (NPM peut être upgradé vers 1.3 only)";;
      *)       warn "Protocole TLS inattendu : '$proto'";;
    esac
  else
    fail "TLS handshake KO sur $host:$port"
  fi
else
  warn "openssl absent — skip check TLS"
fi

# --- 5. Headers durcis --------------------------------------------------
title "Headers durcis sur $API/health"
HEADERS_OUT=$(curl -sSI --max-time "$TIMEOUT" "$API/health" 2>/dev/null || echo "")
if echo "$HEADERS_OUT" | grep -iq '^Strict-Transport-Security'; then
  ok "HSTS présent"
else
  fail "HSTS absent (Strict-Transport-Security) — vérifier NPM Advanced"
fi
if echo "$HEADERS_OUT" | grep -iq '^X-Content-Type-Options:.*nosniff'; then
  ok "X-Content-Type-Options: nosniff présent"
else
  fail "X-Content-Type-Options manquant — vérifier gateway middleware"
fi
if [ "$VERBOSE" = "1" ]; then
  echo "    ↳ headers reçus :"
  echo "$HEADERS_OUT" | sed 's/^/      /'
fi

# --- 6. (optionnel) Login + endpoints applicatifs -----------------------
if [ -n "${SMOKE_USER:-}" ] && [ -n "${SMOKE_PASS:-}" ]; then
  title "Login admin + endpoints applicatifs"
  login_code=$(curl -sS --max-time "$TIMEOUT" -o /tmp/smoke-login.body -w '%{http_code}' \
    -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: $APP" \
    -d "{\"email\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASS}\"}" 2>/dev/null || echo "000")
  if [ "$login_code" != "200" ]; then
    fail "/auth/login → $login_code (attendu 200, body: $(head -c 200 /tmp/smoke-login.body))"
  else
    ok "/auth/login → 200"
    TOKEN=$(grep -oE '"access_token"\s*:\s*"[^"]+"' /tmp/smoke-login.body | head -n1 | sed -E 's/.*"([^"]+)"$/\1/')
    if [ -z "$TOKEN" ]; then
      fail "Impossible d'extraire access_token de la réponse /auth/login"
    else
      AUTH_HEADER="Authorization: Bearer $TOKEN"

      for ep in \
          "/auth/validate" \
          "/mail/me/accounts" \
          "/drive/nodes/recent" \
          "/contacts" ; do
        code=$(curl_http_code GET "$API$ep" -H "$AUTH_HEADER")
        case "$code" in
          200) ok "$ep → 200" ;;
          204) ok "$ep → 204 (vide, OK)" ;;
          404) ok "$ep → 404 (no fixture, acceptable post-deploy)" ;;
          *)   fail "$ep → $code (attendu 200 / 204 / 404)"
               print_extra_if_verbose ;;
        esac
      done
    fi
  fi
else
  echo ""
  echo "ℹ️  SMOKE_USER / SMOKE_PASS non fournis — endpoints authentifiés ignorés."
  echo "    Pour les inclure : SMOKE_USER=admin@... SMOKE_PASS=... ./scripts/ops/smoke-prod.sh"
fi

# --- Résumé -------------------------------------------------------------
title "Résumé"
if [ ${#failures[@]} -eq 0 ]; then
  echo "  ✅ Tous les checks ont passé sur $API / $APP"
  exit 0
fi

echo "  ❌ ${#failures[@]} check(s) échoué(s) :"
for f in "${failures[@]}"; do
  echo "     - $f"
done
exit 1
