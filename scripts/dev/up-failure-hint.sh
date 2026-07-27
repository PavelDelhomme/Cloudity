#!/usr/bin/env bash
# Affiche où aller quand make up-full (ou make test) échoue ou bloque.
# Usage : ./scripts/dev/up-failure-hint.sh [stack|tests|interrupt|generic]
set -euo pipefail

CONTEXT="${1:-generic}"

echo ""
case "$CONTEXT" in
  stack)
    echo "❌ Échec pendant le démarrage (down / up / seed)."
    ;;
  tests)
    echo "❌ Échec pendant les tests (make test)."
    ;;
  interrupt)
    echo "⚠️  Interruption (Ctrl+C) pendant make up-full."
    ;;
  *)
    echo "💡 make up-full n'a pas abouti."
    ;;
esac

echo ""
echo "👉 Pour travailler quand même (stack + compte démo, sans tests, ~5 min) :"
echo "      make up-ready"
echo ""
echo "   Vérifier l'état / URLs :  make status"
echo "   Relancer seulement les tests (stack déjà up) :  make test"
echo "   Tout arrêter + nettoyer :  make down"
echo ""
echo "   Conteneurs *-run-* bloquants :  make down  (ou  docker rm -f \$(docker ps -aq --filter name=run-))"
echo "   Sauter les tests au prochain up-full :  UP_FULL_SKIP_TESTS=1 make up-full"
echo ""
