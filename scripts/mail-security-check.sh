#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIL_PAGE="${ROOT}/frontend/admin-dashboard/src/pages/app/MailPage.tsx"

ok=0
ko=0

pass() {
  echo "✅ $1"
  ok=$((ok + 1))
}

fail() {
  echo "❌ $1"
  ko=$((ko + 1))
}

echo "=== Cloudity Mail Security Check ==="
echo ""

echo "[1/3] Vérif rendu HTML mail sanitizé..."
if rg -n "sanitizeMailHtmlUnsafeInput\(" "$MAIL_PAGE" >/dev/null; then
  pass "Fonction de sanitation HTML présente"
else
  fail "Fonction de sanitation HTML absente"
fi

if rg -n "dangerouslySetInnerHTML=\{\{ __html: safeSelectedMessageHtml \}\}" "$MAIL_PAGE" >/dev/null; then
  pass "dangerouslySetInnerHTML utilise la version sanitizée"
else
  fail "dangerouslySetInnerHTML n'utilise pas safeSelectedMessageHtml"
fi

echo ""
echo "[2/3] Vérif tags/attributs actifs supprimés..."
if rg -n "querySelectorAll\('script, iframe, object, embed, form, meta, base" "$MAIL_PAGE" >/dev/null; then
  pass "Suppression des tags actifs détectée"
else
  fail "Suppression des tags actifs non détectée"
fi

if rg -n "name\.startsWith\('on'\)" "$MAIL_PAGE" >/dev/null; then
  pass "Suppression des attributs on* détectée"
else
  fail "Suppression des attributs on* non détectée"
fi

echo ""
echo "[3/3] Vérif endpoint PJ sans auth/cookies..."
HTTP_CODE="$(curl -sS -o /tmp/cloudity_mail_att_resp.json -w "%{http_code}" \
  -H "Cookie:" \
  "http://localhost:6080/mail/me/accounts/1/messages/1/attachments/1" || true)"

if [[ "$HTTP_CODE" == "401" ]]; then
  pass "PJ non accessible sans auth (HTTP 401)"
else
  fail "PJ devrait répondre 401 sans auth (actuel: $HTTP_CODE)"
fi

echo ""
echo "=== Résultat ==="
echo "Checks OK: $ok"
echo "Checks KO: $ko"

if [[ "$ko" -gt 0 ]]; then
  exit 1
fi

echo "Sécurité Mail: vérifications de base OK."
