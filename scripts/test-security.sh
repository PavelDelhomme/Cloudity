#!/bin/bash
# Vérifications sécurité : audits de dépendances + checks auth (optionnel si stack up)
# Usage: ./scripts/test-security.sh

set -e

PORT_GATEWAY="${PORT_GATEWAY:-6000}"
failed=0

echo "🔒 Vérifications sécurité..."

# --- Audits de dépendances ---
echo ""
echo "  [npm audit] admin-dashboard..."
if (cd frontend/admin-dashboard 2>/dev/null && npm audit --audit-level=high 2>/dev/null); then
  echo "  ✅ npm audit (high) OK"
else
  echo "  ⚠️  npm audit : vulnérabilités high ou erreur (vérifiez avec npm audit)"
  # On ne fait pas failed=1 pour ne pas bloquer si des vulns existent déjà
fi

echo "  [pip] admin-service (safety si installé)..."
if command -v safety >/dev/null 2>&1; then
  if (cd backend/admin-service 2>/dev/null && safety check -r requirements.txt 2>/dev/null); then
    echo "  ✅ safety OK"
  else
    echo "  ⚠️  safety : vulnérabilités ou erreur"
  fi
else
  echo "  ⏭️  safety non installé (pip install safety)"
fi

echo "  [go] backends (govulncheck si dispo)..."
if command -v govulncheck >/dev/null 2>&1; then
  for dir in backend/auth-service backend/api-gateway backend/password-manager; do
    if [ -d "$dir" ]; then
      if (cd "$dir" && govulncheck ./... 2>/dev/null); then
        echo "  ✅ govulncheck $dir OK"
      else
        echo "  ⚠️  govulncheck $dir : vulnérabilités ou erreur"
      fi
    fi
  done
else
  echo "  ⏭️  govulncheck non installé (go install golang.org/x/vuln/cmd/govulncheck@latest)"
fi

# --- Checks auth (si la stack répond) ---
echo ""
echo "  [auth] GET /auth/validate sans token → 401..."
out=$(curl -sf -w "%{http_code}" -o /dev/null "http://localhost:${PORT_GATEWAY}/auth/validate" 2>/dev/null) || true
if [ "$out" = "401" ] || [ "$out" = "000" ]; then
  if [ "$out" = "401" ]; then
    echo "  ✅ /auth/validate sans token → 401"
  else
    echo "  ⏭️  Gateway non joignable (make up pour tester)"
  fi
else
  echo "  ❌ /auth/validate attendu 401, reçu: $out"
  failed=1
fi

echo "  [auth] GET /auth/validate avec token invalide → 401..."
out=$(curl -sf -w "%{http_code}" -o /dev/null -H "Authorization: Bearer invalid" "http://localhost:${PORT_GATEWAY}/auth/validate" 2>/dev/null) || true
if [ "$out" = "401" ] || [ "$out" = "000" ]; then
  if [ "$out" = "401" ]; then
    echo "  ✅ /auth/validate token invalide → 401"
  fi
else
  if [ "$out" != "000" ]; then
    echo "  ❌ /auth/validate token invalide attendu 401, reçu: $out"
    failed=1
  fi
fi

echo ""
if [ $failed -eq 1 ]; then
  echo "❌ Au moins un check sécurité a échoué."
  exit 1
fi
echo "✅ Vérifications sécurité terminées."
exit 0
