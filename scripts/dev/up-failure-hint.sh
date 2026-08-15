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
    echo "⚠️  Échec pendant les tests (make test) — la stack peut quand même tourner."
    ;;
  interrupt)
    echo "⚠️  Interruption (Ctrl+C) pendant make up-full."
    ;;
  *)
    echo "💡 make up-full n'a pas abouti complètement."
    ;;
esac

echo ""
echo "👉 Pour travailler tout de suite (stack + comptes démo, sans tests, ~5 min) :"
echo "      make up-ready"
echo ""
echo "   Ou reprise sans tests :  UP_FULL_SKIP_TESTS=1 make up-full"
echo "   Vérifier l'état / URLs :  make status"
echo "   Relancer seulement les tests (stack déjà up) :  make test"
echo "   Tout arrêter + nettoyer :  make down"
echo ""
echo "   Conteneurs *-run-* bloquants :  make down  (ou  docker rm -f \$(docker ps -aq --filter name=run-))"
echo "   Exiger tests verts (CI-like) :  UP_FULL_REQUIRE_TESTS=1 make up-full"
echo "   Forcer build Pass strict :  CLOUDITY_REQUIRE_PASS_EXTENSION=1 make build-pass-extension"
echo ""
