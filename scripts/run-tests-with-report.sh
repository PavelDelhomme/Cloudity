#!/usr/bin/env bash
# Lance tous les tests (unit/app, E2E, sécurité) et génère un rapport.
# En console : résumé par phase + en cas d'échec, extrait lisible de l'erreur.
# Usage: ./scripts/run-tests-with-report.sh  ou  make tests

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p reports
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG="reports/test-${TIMESTAMP}.log"

# Affiche les N dernières lignes du fichier $1 (pour extrait d'erreur)
show_tail() {
  local file="$1"
  local n="${2:-25}"
  if [ -f "$file" ]; then
    echo "--- Dernières lignes (max $n) ---"
    tail -n "$n" "$file"
    echo "--- Fin extrait. Rapport complet: $LOG ---"
  fi
}

{
  echo "========================================"
  echo "Rapport des tests Cloudity - $TIMESTAMP"
  echo "========================================"
} > "$LOG"

# ----- Phase 1 -----
echo "" >> "$LOG"
echo ">>> Phase 1: Tests unitaires et applicatifs (make test)" >> "$LOG"
if make test >> "$LOG" 2>&1; then
  UNIT_STATUS="OK"
  echo "  Phase 1 (Unit/App)  : OK"
else
  UNIT_STATUS="FAIL"
  echo "  Phase 1 (Unit/App)  : ÉCHEC"
  echo ""
  echo "Extrait de l'erreur (Phase 1):"
  show_tail "$LOG" 50
  echo ""
fi

# ----- Phase 2 -----
echo "" >> "$LOG"
echo ">>> Phase 2: Tests E2E (make test-e2e)" >> "$LOG"
if make test-e2e >> "$LOG" 2>&1; then
  E2E_STATUS="OK"
  echo "  Phase 2 (E2E)       : OK"
else
  E2E_STATUS="FAIL"
  echo "  Phase 2 (E2E)       : ÉCHEC (stack démarrée ? make up)"
  echo ""
  echo "Extrait de l'erreur (Phase 2):"
  show_tail "$LOG" 35
  echo ""
fi

# ----- Phase 3 -----
echo "" >> "$LOG"
echo ">>> Phase 3: Vérifications sécurité (make test-security)" >> "$LOG"
if make test-security >> "$LOG" 2>&1; then
  SEC_STATUS="OK"
  echo "  Phase 3 (Sécurité)  : OK"
else
  SEC_STATUS="FAIL"
  echo "  Phase 3 (Sécurité)  : ÉCHEC ou avertissements"
  echo ""
  echo "Extrait de l'erreur (Phase 3):"
  show_tail "$LOG" 35
  echo ""
fi

# ----- Résumé (console + log) -----
{
  echo ""
  echo "========================================"
  echo "RÉSUMÉ"
  echo "========================================"
  echo "  Unit/App:  $UNIT_STATUS"
  echo "  E2E:       $E2E_STATUS"
  echo "  Sécurité:  $SEC_STATUS"
  echo "  Rapport:   $LOG"
  echo "========================================"
} | tee -a "$LOG"

if [ "$UNIT_STATUS" = "FAIL" ] || [ "$E2E_STATUS" = "FAIL" ] || [ "$SEC_STATUS" = "FAIL" ]; then
  echo ""
  echo "❌ Au moins une phase a échoué. Détails ci‑dessus ou dans: $LOG"
  exit 1
fi
echo ""
echo "✅ Tous les tests sont passés. Rapport: $LOG"
exit 0
