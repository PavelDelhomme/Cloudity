#!/bin/bash
# Vérifications sécurité : audits de dépendances (npm, safety, govulncheck) dans Docker + checks auth
# Usage: ./scripts/test-security.sh
# Nécessite : docker compose (ou docker-compose). Les audits tournent dans les conteneurs.
# Rapports : reports/security-npm-audit.txt, reports/govulncheck-<service>.txt
# Si des vulnérabilités ou avertissements sont détectés, crée reports/.security-avertissements
# pour que le résumé make tests affiche "OK (avertissements)" au lieu de "OK".

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p reports
rm -f reports/.security-avertissements
REMEDIATION_FILE="$ROOT/reports/security-remediation-hints.txt"

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
echo "   Rapports détaillés : $ROOT/reports/security-*.txt"

# --- npm audit (admin-dashboard) dans le conteneur ---
echo ""
echo "  [npm audit] admin-dashboard (Docker)..."
NPM_AUDIT_LOG="$ROOT/reports/security-npm-audit.txt"
if $COMPOSE $COMPOSE_FILES run --rm admin-dashboard sh -c "npm install --no-audit --no-fund 2>/dev/null; npm audit --audit-level=high" >"$NPM_AUDIT_LOG" 2>&1; then
  echo "  ✅ npm audit (high) OK"
else
  echo "  ⚠️  npm audit : vulnérabilités high ou erreur — détail : $NPM_AUDIT_LOG"
  warnings=1
fi
# Toujours enregistrer l’audit complet (même si --audit-level=high passe)
$COMPOSE $COMPOSE_FILES run --rm admin-dashboard sh -c "npm install --no-audit --no-fund 2>/dev/null; npm audit" >"$ROOT/reports/security-npm-audit-full.txt" 2>&1 || true

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
{
  echo "Cloudity — pistes de remédiation (automatique, à valider manuellement)"
  echo ""
  echo "- Go stdlib : exécuter govulncheck avec un toolchain Go patché (ex. Go 1.25.9) pour éviter les faux positifs liés à une image locale obsolète."
  echo "- Modules directs : mettre à jour jwt/v5, go-redis, etc. dans les go.mod concernés (go get -u=patch ou version fix indiquée par pkg.go.dev/vuln)."
  echo "- Frontend : maintenir npm audit en vert (lot xlsx déjà migré) et surveiller les transitive deps au fil des updates."
  echo "- Tooling front : évaluer les migrations majeures séparément du runtime production."
  echo ""
} >"$REMEDIATION_FILE"

for dir in backend/auth-service backend/api-gateway backend/password-manager backend/mail-directory-service backend/calendar-service backend/contacts-service backend/notes-service backend/tasks-service backend/photos-service backend/drive-service; do
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
    contacts-service) svc="contacts-service" ;;
    notes-service) svc="notes-service" ;;
    tasks-service) svc="tasks-service" ;;
    photos-service) svc="photos-service" ;;
    drive-service) svc="drive-service" ;;
    *) continue ;;
  esac
  logf="$ROOT/reports/govulncheck-${name}.txt"
  if docker run --rm \
    -v "$ROOT/$dir:/src" \
    -w /src \
    golang:1.25.9-alpine \
    sh -c "apk add --no-cache git >/dev/null 2>&1 && go install golang.org/x/vuln/cmd/govulncheck@latest >/dev/null 2>&1 && /go/bin/govulncheck ./..." >"$logf" 2>&1; then
    echo "  ✅ govulncheck $name OK"
  else
    echo "  ⚠️  govulncheck $name : signalétique — détail : $logf"
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
  echo "   Fichiers utiles : reports/security-npm-audit.txt, reports/security-npm-audit-full.txt, reports/govulncheck-*.txt, reports/security-remediation-hints.txt"
else
  echo "✅ Vérifications sécurité terminées."
fi
exit 0
