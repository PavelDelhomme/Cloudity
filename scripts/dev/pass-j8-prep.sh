#!/usr/bin/env bash
# Préparation J8 — migration Proton Pass (runbook docs/produit/SPRINT-PASS-2026-05.md § 3 bis).
# Lance les tests Pass applicables puis affiche la checklist manuelle du jour J.
#
# Usage (racine du dépôt) :
#   ./scripts/dev/pass-j8-prep.sh
#   SKIP_TESTS=1 ./scripts/dev/pass-j8-prep.sh   # checklist seulement
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "🔐 Cloudity Pass — préparation J8 (migration Proton)"
echo "===================================================="
echo ""

if [ "${SKIP_TESTS:-}" != "1" ]; then
  echo "🧪 Tests automatisés Pass (make test-pass)…"
  echo ""
  if ! make test-pass; then
    echo -e "${RED}❌ test-pass en échec — corriger avant l’import réel.${NC}" >&2
    exit 1
  fi
  echo ""
  echo -e "${GREEN}✅ test-pass OK${NC}"
  echo ""
else
  echo -e "${YELLOW}⚠ SKIP_TESTS=1 — tests ignorés${NC}"
  echo ""
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    DC=(docker compose)
  else
    DC=(docker-compose)
  fi
  if "${DC[@]}" ps --status running passwords-service 2>/dev/null | grep -q passwords-service; then
    echo -e "${GREEN}✅${NC} passwords-service en cours d’exécution"
  else
    echo -e "${YELLOW}⚠${NC} passwords-service non démarré — lancer : make up"
  fi
  # shellcheck disable=SC1091
  [ -f .env ] && source .env
  PORT_DASHBOARD="${PORT_DASHBOARD:-6080}"
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${PORT_DASHBOARD}/" 2>/dev/null; then
    echo -e "${GREEN}✅${NC} Dashboard http://localhost:${PORT_DASHBOARD}/"
  else
    echo -e "${YELLOW}⚠${NC} Dashboard inaccessible sur :${PORT_DASHBOARD} (make up + make wait-for-dashboard)"
  fi
else
  echo -e "${YELLOW}⚠ Docker indisponible — vérifications stack ignorées${NC}"
fi

echo ""
echo "📋 Checklist J8 (manuelle — cocher au fil de l’eau)"
echo "---------------------------------------------------"
echo "  [ ] Export Proton Pass → JSON en clair (compte pilote), stockage chiffré"
echo "  [ ] Sauvegarde Cloudity (DB + volumes) ; rollback : docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md § 10 bis"
echo "  [ ] Import web : /app/pass → Importer Proton → ≥ 50 entrées cohérentes"
echo "  [ ] 2FA compte Cloudity : login web avec TOTP sur le compte pilote"
echo "  [ ] Mobile pass (lecture) : déverrouillage, liste, détail, copie + biométrie"
echo "  [ ] Bascule : arrêt usage quotidien Proton Pass (critères sprint § 5)"
echo ""
echo "🔗 Runbook complet : docs/produit/SPRINT-PASS-2026-05.md § 3 bis et § 5"
echo "🎭 E2E Pass (optionnel avant import) : make test-e2e-playwright-pass  (make up, make seed-admin)"
echo "🧹 Coffres e2e Playwright : make clean-pass-e2e-vaults"
echo ""
