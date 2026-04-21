#!/usr/bin/env bash
# Lance tous les tests (unit/app, E2E, E2E Playwright, sécurité, mobile Flutter Photos + Drive + Mail).
# Exécute toujours les 5 phases puis affiche le résumé (ne s’arrête pas à la première erreur).
# Usage: ./scripts/run-tests-with-report.sh  ou  make tests

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Évite mélanges binaires / encodage incohérent dans tee et les outils CLI (npm, Playwright, etc.)
export LC_ALL=C.UTF-8
export LANG=C.UTF-8
export PYTHONUTF8=1
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

MOBILE_PHOTOS_STATUS="SKIP"

{
  echo "========================================"
  echo "Rapport des tests Cloudity - $TIMESTAMP"
  echo "========================================"
} > "$LOG"

echo "========================================"
echo "  CLOUDITY — make tests"
echo "  Lance : make test + test-e2e + test-e2e-playwright + test-security + test-mobile-suite (Photos + Drive + Mail)"
echo "  Rapport détaillé : $LOG"
echo "  Dossier rapports : $ROOT/reports/"
echo "========================================"
echo ""
echo "Résumé des phases :"
echo "  1. make test           — Tests unitaires/applicatifs **dans Docker** (compose run / exec)"
echo "  2. make test-e2e       — E2E health/proxy (stack démarrée)"
echo "  3. make test-e2e-playwright — E2E navigateur Playwright (Hub, Drive, Calendrier, Mail… stack + seed-admin)"
echo "  4. make test-security  — Audits de dépendances + auth"
echo "  5. test-mobile-suite   — Flutter Photos + Drive + Mail (hôte + integration_test ADB si appareil / SDK OK)"
echo ""

# ----- Phase 1 -----
echo ""
echo ">>> Phase 1/5 : Tests unitaires et applicatifs (make test)"
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
echo ">>> Phase 2/5 : Tests E2E health/proxy (make test-e2e)"
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
echo ">>> Phase 3/5 : Tests E2E navigateur Playwright (make test-e2e-playwright)"
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
echo ">>> Phase 4/5 : Vérifications sécurité (make test-security)"
if run_phase "Phase 4: make test-security" "make test-security"; then
  if [ -f reports/.security-avertissements ]; then
    SEC_STATUS="OK (avertissements)"
    echo ""
    echo "  Phase 4 (Sécurité)  : OK (avertissements vulnérabilités — voir rapport)"
  else
    SEC_STATUS="OK"
    echo ""
    echo "  Phase 4 (Sécurité)  : OK"
  fi
else
  SEC_STATUS="FAIL"
  echo ""
  echo "  Phase 4 (Sécurité)  : ÉCHEC"
  show_tail "$LOG" 35
fi

# ----- Phase 5 (Flutter Photos + Drive : hôte + ADB optionnel) -----
echo ""
echo ">>> Phase 5/5 : Mobile Cloudity (./scripts/test-mobile-suite.sh)"
MOBILE_PHOTOS_STATUS="OK"
if run_phase "Phase 5: test-mobile-suite" "chmod +x scripts/test-mobile-suite.sh scripts/test-mobile-app.sh scripts/test-mobile-mail.sh 2>/dev/null || true; ./scripts/test-mobile-suite.sh"; then
  echo ""
  echo "  Phase 5 (Mobile P+D+M) : OK"
else
  MOBILE_PHOTOS_STATUS="FAIL"
  echo ""
  echo "  Phase 5 (Mobile P+D+M) : ÉCHEC (flutter test / integration_test — voir log)"
  show_tail "$LOG" 40
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
  echo "  Mobile (P+D+M): $MOBILE_PHOTOS_STATUS"
  echo "  Rapport:        $LOG"
  echo "  Répertoire:     $ROOT (racine du dépôt)"
  echo "========================================"
} | tee -a "$LOG"

if [ "$UNIT_STATUS" = "FAIL" ] || [ "$E2E_STATUS" = "FAIL" ] || [ "$E2E_PW_STATUS" = "FAIL" ] || [ "$SEC_STATUS" = "FAIL" ] || [ "$MOBILE_PHOTOS_STATUS" = "FAIL" ]; then
  echo ""
  echo "❌ RÉSULTAT FINAL : ÉCHEC (au moins une phase a échoué)"
  echo "   Rapport complet : $LOG"
  echo "   Vous êtes toujours dans la racine du dépôt."
  exit 1
fi
if [ "$SEC_STATUS" = "OK (avertissements)" ]; then
  echo ""
  echo "✅ RÉSULTAT FINAL : SUCCÈS (avec avertissements sécurité — vulnérabilités signalées)"
  echo "   Vulnérabilités : npm audit (admin-dashboard), govulncheck (services Go). Détails dans le rapport."
  echo "   Rapport : $LOG"
  echo "   Vous êtes toujours dans la racine du dépôt."
else
  echo ""
  echo "✅ RÉSULTAT FINAL : SUCCÈS (tous les tests sont passés)"
  echo "   Rapport : $LOG"
  echo "   Vous êtes toujours dans la racine du dépôt."
fi
exit 0
