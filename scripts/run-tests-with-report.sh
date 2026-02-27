#!/usr/bin/env bash
# Lance tous les tests (unit/app, E2E, E2E Playwright, sécurité).
# Exécute toujours les 4 phases puis affiche le résumé (ne s’arrête pas à la première erreur).
# Usage: ./scripts/run-tests-with-report.sh  ou  make tests

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p reports
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG="reports/test-${TIMESTAMP}.log"

# Affiche les N dernières lignes du fichier $1 (en cas d'échec)
show_tail() {
  local file="$1"
  local n="${2:-25}"
  if [ -f "$file" ]; then
    echo ""
    echo "--- Dernières lignes du log (max $n) ---"
    tail -n "$n" "$file"
    echo "--- Fin. Rapport complet: $LOG ---"
  fi
}

# Exécute une commande : affichage en direct + enregistrement dans le log. Ne fait pas sortir le script.
run_phase() {
  local name="$1"
  local cmd="$2"
  local r
  echo "" | tee -a "$LOG"
  echo ">>> $name" | tee -a "$LOG"
  echo "" | tee -a "$LOG"
  eval "$cmd" 2>&1 | tee -a "$LOG"
  r=${PIPESTATUS[0]}
  return "$r"
}

{
  echo "========================================"
  echo "Rapport des tests Cloudity - $TIMESTAMP"
  echo "========================================"
} > "$LOG"

echo "========================================"
echo "  CLOUDITY — make tests"
echo "  Rapport: $LOG"
echo "  (toutes les phases sont exécutées, résumé en fin)"
echo "========================================"

# ----- Phase 1 -----
echo ""
echo ">>> Phase 1/4 : Tests unitaires et applicatifs (make test)"
if run_phase "Phase 1: make test" "make test"; then
  UNIT_STATUS="OK"
  echo ""
  echo "  Phase 1 (Unit/App)  : OK"
else
  UNIT_STATUS="FAIL"
  echo ""
  echo "  Phase 1 (Unit/App)  : ÉCHEC"
  show_tail "$LOG" 50
fi

# ----- Phase 2 -----
echo ""
echo ">>> Phase 2/4 : Tests E2E health/proxy (make test-e2e)"
if run_phase "Phase 2: make test-e2e" "make test-e2e"; then
  E2E_STATUS="OK"
  echo ""
  echo "  Phase 2 (E2E)       : OK"
else
  E2E_STATUS="FAIL"
  echo ""
  echo "  Phase 2 (E2E)       : ÉCHEC (stack démarrée ? make up)"
  show_tail "$LOG" 35
fi

# ----- Phase 3 -----
echo ""
echo ">>> Phase 3/4 : Tests E2E navigateur Playwright (make test-e2e-playwright)"
if run_phase "Phase 3: make test-e2e-playwright" "make test-e2e-playwright"; then
  E2E_PW_STATUS="OK"
  echo ""
  echo "  Phase 3 (E2E Playwright) : OK"
else
  E2E_PW_STATUS="FAIL"
  echo ""
  echo "  Phase 3 (E2E Playwright) : ÉCHEC (make up + make seed-admin ?)"
  show_tail "$LOG" 35
fi

# ----- Phase 4 -----
echo ""
echo ">>> Phase 4/4 : Vérifications sécurité (make test-security)"
if run_phase "Phase 4: make test-security" "make test-security"; then
  SEC_STATUS="OK"
  echo ""
  echo "  Phase 4 (Sécurité)  : OK"
else
  SEC_STATUS="FAIL"
  echo ""
  echo "  Phase 4 (Sécurité)  : ÉCHEC ou avertissements"
  show_tail "$LOG" 35
fi

# ----- Résumé (toujours affiché) -----
{
  echo ""
  echo "========================================"
  echo "RÉSUMÉ"
  echo "========================================"
  echo "  Unit/App:       $UNIT_STATUS"
  echo "  E2E:            $E2E_STATUS"
  echo "  E2E Playwright: $E2E_PW_STATUS"
  echo "  Sécurité:       $SEC_STATUS"
  echo "  Rapport:        $LOG"
  echo "========================================"
} | tee -a "$LOG"

if [ "$UNIT_STATUS" = "FAIL" ] || [ "$E2E_STATUS" = "FAIL" ] || [ "$E2E_PW_STATUS" = "FAIL" ] || [ "$SEC_STATUS" = "FAIL" ]; then
  echo ""
  echo "❌ Au moins une phase a échoué. Rapport complet: $LOG"
  exit 1
fi
echo ""
echo "✅ Tous les tests sont passés. Rapport: $LOG"
exit 0
