#!/bin/bash
# Vérifications sécurité : audits de dépendances (npm, safety, govulncheck) dans Docker + checks auth
# Usage: ./scripts/test-security.sh
# Nécessite : docker compose (ou docker-compose). Les audits tournent dans les conteneurs.
# Si des vulnérabilités ou avertissements sont détectés, crée reports/.security-avertissements
# pour que le résumé make tests affiche "OK (avertissements)" au lieu de "OK".

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -f reports/.security-avertissements

# Même logique que le Makefile pour docker compose vs docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

COMPOSE_FILES="-f docker-compose.yml"
PORT_GATEWAY="${PORT_GATEWAY:-6080}"
failed=0
warnings=0

echo "🔒 Vérifications sécurité (audits dans Docker)..."

# --- npm audit (admin-dashboard) dans le conteneur ---
echo ""
echo "  [npm audit] admin-dashboard (Docker)..."
if $COMPOSE $COMPOSE_FILES run --rm admin-dashboard sh -c "npm install --no-audit --no-fund 2>/dev/null; npm audit --audit-level=high 2>/dev/null"; then
  echo "  ✅ npm audit (high) OK"
else
  echo "  ⚠️  npm audit : vulnérabilités high ou erreur (vérifiez avec: cd frontend/admin-dashboard && npm audit)"
  warnings=1
fi

# --- safety (admin-service) dans le conteneur ---
echo ""
echo "  [safety] admin-service (Docker)..."
if $COMPOSE $COMPOSE_FILES run --rm admin-service sh -c "pip install -q safety 2>/dev/null; safety check -r requirements.txt 2>/dev/null"; then
  echo "  ✅ safety OK"
else
  echo "  ⚠️  safety : vulnérabilités ou erreur"
  warnings=1
fi

# --- govulncheck (backends Go) dans les conteneurs ---
echo ""
echo "  [govulncheck] backends Go (Docker)..."
for dir in backend/auth-service backend/api-gateway backend/password-manager backend/mail-directory-service backend/calendar-service backend/notes-service backend/tasks-service backend/drive-service; do
  if [ ! -d "$dir" ]; then
    continue
  fi
  name=$(basename "$dir")
  case "$name" in
    auth-service) svc="auth-service" ;;
    api-gateway) svc="api-gateway" ;;
    password-manager) svc="password-manager" ;;
    mail-directory-service) svc="mail-directory-service" ;;
    calendar-service) svc="calendar-service" ;;
    notes-service) svc="notes-service" ;;
    tasks-service) svc="tasks-service" ;;
    drive-service) svc="drive-service" ;;
    *) continue ;;
  esac
  if $COMPOSE $COMPOSE_FILES run --rm "$svc" sh -c "export PATH=\$PATH:/go/bin && go install golang.org/x/vuln/cmd/govulncheck@latest 2>/dev/null && govulncheck ./... 2>/dev/null"; then
    echo "  ✅ govulncheck $name OK"
  else
    echo "  ⚠️  govulncheck $name : vulnérabilités ou erreur"
    warnings=1
  fi
done

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

# Marquer les avertissements pour le résumé make tests
if [ "$warnings" = "1" ]; then
  mkdir -p reports
  touch reports/.security-avertissements
fi

echo ""
if [ $failed -eq 1 ]; then
  echo "❌ Au moins un check sécurité a échoué."
  exit 1
fi
if [ "$warnings" = "1" ]; then
  echo "✅ Vérifications sécurité terminées (avec avertissements / vulnérabilités signalées)."
else
  echo "✅ Vérifications sécurité terminées."
fi
exit 0
