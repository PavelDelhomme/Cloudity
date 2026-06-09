#!/bin/bash
# Vérifications sécurité : audits de dépendances (npm, safety, govulncheck),
# analyse statique Go (gosec), dans Docker + checks auth
# Usage: ./scripts/ci/test-security.sh
# Nécessite : docker compose (ou docker-compose). Les audits tournent dans les conteneurs.
# Rapports : reports/security-npm-audit.txt, reports/govulncheck-<service>.txt, reports/gosec-<service>.txt
# Si des vulnérabilités ou avertissements sont détectés, crée reports/.security-avertissements
# pour que le résumé make tests affiche "OK (avertissements)" au lieu de "OK".

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
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

# --- npm audit (monorepo frontend : racine /ws puis app) dans le conteneur ---
echo ""
echo "  [npm audit] frontend workspaces / @cloudity/web (Docker)..."
NPM_AUDIT_LOG="$ROOT/reports/security-npm-audit.txt"
NPM_IN_CONTAINER='cd /ws && npm install --no-audit --no-fund 2>/dev/null && npm audit'
if $COMPOSE $COMPOSE_FILES run --rm cloudity-web sh -c "$NPM_IN_CONTAINER --audit-level=high" >"$NPM_AUDIT_LOG" 2>&1; then
  echo "  ✅ npm audit (high) OK"
else
  echo "  ⚠️  npm audit : vulnérabilités high ou erreur — détail : $NPM_AUDIT_LOG"
  warnings=1
fi
# Toujours enregistrer l’audit complet (même si --audit-level=high passe)
$COMPOSE $COMPOSE_FILES run --rm cloudity-web sh -c "$NPM_IN_CONTAINER" >"$ROOT/reports/security-npm-audit-full.txt" 2>&1 || true

# --- pip-audit (admin-service) dans le conteneur ---
echo ""
echo "  [pip-audit] admin-service (Docker)..."
PIP_AUDIT_LOG="$ROOT/reports/security-pip-audit.txt"
if $COMPOSE $COMPOSE_FILES run --rm admin-service sh -c "pip install -q pip-audit 2>/dev/null; pip-audit -r requirements.txt" >"$PIP_AUDIT_LOG" 2>&1; then
  echo "  ✅ pip-audit OK"
else
  echo "  ⚠️  pip-audit : vulnérabilités ou erreur — détail : $PIP_AUDIT_LOG"
  warnings=1
fi

# --- govulncheck (backends Go) dans les conteneurs ---
echo ""
echo "  [govulncheck] backends Go (Docker)..."
{
  echo "Cloudity — pistes de remédiation (automatique, à valider manuellement)"
  echo ""
  echo "- Go stdlib : exécuter govulncheck avec un toolchain Go patché (ex. Go 1.25.11) pour éviter les faux positifs liés à une image locale obsolète."
  echo "- Modules directs : mettre à jour jwt/v5, go-redis, etc. dans les go.mod concernés (go get -u=patch ou version fix indiquée par pkg.go.dev/vuln)."
  echo "- Frontend : maintenir npm audit en vert (lot xlsx déjà migré) et surveiller les transitive deps au fil des updates."
  echo "- Tooling front : évaluer les migrations majeures séparément du runtime production."
  echo ""
} >"$REMEDIATION_FILE"

for dir in backend/auth-service backend/api-gateway backend/passwords-service backend/mail-directory-service backend/calendar-service backend/contacts-service backend/notes-service backend/tasks-service backend/photos-service backend/drive-service; do
  if [ ! -d "$dir" ]; then
    continue
  fi
  name=$(basename "$dir")
  case "$name" in
    auth-service) svc="auth-service" ;;
    api-gateway) svc="api-gateway" ;;
    passwords-service) svc="passwords-service" ;;
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
  go_apk="apk add --no-cache git >/dev/null 2>&1"
  go_env=""
  if [ "$name" = "drive-service" ]; then
    go_apk="apk add --no-cache git gcc g++ musl-dev >/dev/null 2>&1"
    go_env="CGO_ENABLED=1"
  fi
  if docker run --rm \
    -v "$ROOT/$dir:/src" \
    -v "$ROOT/backend/internalsec:/internalsec:ro" \
    -w /src \
    golang:1.25.11-alpine \
    sh -c "$go_apk && go install golang.org/x/vuln/cmd/govulncheck@latest >/dev/null 2>&1 && $go_env /go/bin/govulncheck ./..." >"$logf" 2>&1; then
    echo "  ✅ govulncheck $name OK"
  else
    echo "  ⚠️  govulncheck $name : signalétique — détail : $logf"
    warnings=1
  fi
done

# --- gosec (analyse statique Go) dans les conteneurs ---
# Q20=A : actif en mode WARNING d'abord (faux positifs probables sur le 1er run).
# Bascule en BLOCKING (set GOSEC_BLOCKING=1) après tri du 1er rapport — cf.
# docs/securite/CRYPTO-NORME.md § 8.1 et BACKLOG.md § Crypto / perf.
GOSEC_BLOCKING="${GOSEC_BLOCKING:-0}"
echo ""
echo "  [gosec] backends Go — analyse statique (Docker, mode $([ "$GOSEC_BLOCKING" = "1" ] && echo BLOCKING || echo WARNING))..."

for dir in backend/auth-service backend/api-gateway backend/passwords-service backend/mail-directory-service backend/calendar-service backend/contacts-service backend/notes-service backend/tasks-service backend/photos-service backend/drive-service backend/internalsec backend/pkg/dbpin; do
  if [ ! -d "$dir" ]; then
    continue
  fi
  name=$(basename "$dir")
  logf="$ROOT/reports/gosec-${name}.txt"
  gosec_apk="apk add --no-cache git >/dev/null 2>&1"
  gosec_env=""
  if [ "$name" = "drive-service" ]; then
    gosec_apk="apk add --no-cache git gcc g++ musl-dev >/dev/null 2>&1"
    gosec_env="CGO_ENABLED=1"
  fi
  if docker run --rm \
    -v "$ROOT/$dir:/src" \
    -v "$ROOT/backend/internalsec:/internalsec:ro" \
    -v "$ROOT/.gosec.json:/gosec.json:ro" \
    -w /src \
    golang:1.25.11-alpine \
    sh -c "$gosec_apk && go install github.com/securego/gosec/v2/cmd/gosec@latest >/dev/null 2>&1 && $gosec_env /go/bin/gosec -quiet -fmt=text -conf=/gosec.json ./..." >"$logf" 2>&1; then
    echo "  ✅ gosec $name OK"
  else
    if [ "$GOSEC_BLOCKING" = "1" ]; then
      echo "  ❌ gosec $name : findings — détail : $logf (BLOCKING)"
      failed=1
    else
      echo "  ⚠️  gosec $name : findings — détail : $logf (warning, set GOSEC_BLOCKING=1 pour fail)"
      warnings=1
    fi
  fi
done

# --- gitleaks : scan secrets sur l'historique Git complet ---
# Cf. docs/securite/SECRETS.md § 6. Image officielle zricethezav/gitleaks:latest.
# Mode WARNING par défaut (faux positifs possibles), basculer en BLOCKING via
# GITLEAKS_BLOCKING=1 une fois la baseline confirmée propre. `gitleaks detect`
# (sans --no-git) couvre l'historique → bloque toute fuite future poussée.
GITLEAKS_BLOCKING="${GITLEAKS_BLOCKING:-0}"
GITLEAKS_LOG="$ROOT/reports/security-gitleaks.txt"
echo ""
echo "  [gitleaks] scan secrets historique git (mode $([ "$GITLEAKS_BLOCKING" = "1" ] && echo BLOCKING || echo WARNING))..."
if docker run --rm \
  -v "$ROOT:/repo" \
  -w /repo \
  zricethezav/gitleaks:latest \
  detect --redact -v --config /repo/.gitleaks.toml \
  >"$GITLEAKS_LOG" 2>&1; then
  echo "  ✅ gitleaks : aucune fuite détectée dans l'historique"
else
  if [ "$GITLEAKS_BLOCKING" = "1" ]; then
    echo "  ❌ gitleaks : secrets détectés — détail : $GITLEAKS_LOG (BLOCKING)"
    failed=1
  else
    echo "  ⚠️  gitleaks : secrets détectés — détail : $GITLEAKS_LOG (warning, set GITLEAKS_BLOCKING=1 pour fail)"
    warnings=1
  fi
fi

# --- check-versioning : libs partagées (Phase 0) ---
# Cf. docs/architecture/VERSIONNAGE-LIBS.md § 6. Mode WARNING par défaut ;
# CHECK_VERSIONING_BLOCKING=1 fait fail le build si une lib a changé sans
# bump CHANGELOG / version.
CHECK_VERSIONING_BLOCKING_LOCAL="${CHECK_VERSIONING_BLOCKING:-0}"
CHECK_VERSIONING_LOG="$ROOT/reports/security-check-versioning.txt"
echo ""
echo "  [check-versioning] libs partagées (mode $([ "$CHECK_VERSIONING_BLOCKING_LOCAL" = "1" ] && echo BLOCKING || echo WARNING))..."
if CHECK_VERSIONING_BLOCKING="$CHECK_VERSIONING_BLOCKING_LOCAL" \
   "$ROOT/scripts/ci/check-versioning.sh" >"$CHECK_VERSIONING_LOG" 2>&1; then
  echo "  ✅ check-versioning : OK (détail : $CHECK_VERSIONING_LOG)"
else
  if [ "$CHECK_VERSIONING_BLOCKING_LOCAL" = "1" ]; then
    echo "  ❌ check-versioning : oubli de bump détecté — détail : $CHECK_VERSIONING_LOG (BLOCKING)"
    failed=1
  else
    echo "  ⚠️  check-versioning : oubli de bump détecté — détail : $CHECK_VERSIONING_LOG (warning, set CHECK_VERSIONING_BLOCKING=1 pour fail)"
    warnings=1
  fi
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
