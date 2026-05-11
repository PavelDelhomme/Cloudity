#!/usr/bin/env bash
# Vérifie vm.overcommit_memory (recommandation Redis). Réglage = hôte Linux, pas le conteneur.
# Usage: ./scripts/dev/redis-host-sysctl.sh
#        APPLY=1 ./scripts/dev/redis-host-sysctl.sh   → tente: sudo sysctl vm.overcommit_memory=1
set -euo pipefail

if ! command -v sysctl >/dev/null 2>&1; then
  echo "sysctl introuvable (hôte non-Linux ?). Ignore ce script ou consultez docs/operations/DEVELOPMENT-HOST.md"
  exit 0
fi

val=$(sysctl -n vm.overcommit_memory 2>/dev/null || echo "?")
echo "vm.overcommit_memory = ${val}"
echo "  (0 = défaut strict, 1 = recommandé pour Redis — voir docs/operations/DEVELOPMENT-HOST.md)"

if [ "$val" = "1" ]; then
  echo "OK — Redis ne devrait plus avertir pour l’overcommit."
  exit 0
fi

if [ "${APPLY:-}" = "1" ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "Application: sudo sysctl vm.overcommit_memory=1"
    sudo sysctl vm.overcommit_memory=1
    echo "Fait (session courante). Pour rendre permanent : voir docs/operations/DEVELOPMENT-HOST.md"
    exit 0
  fi
  echo "sudo absent : exécutez en root : sysctl vm.overcommit_memory=1"
  exit 1
fi

echo ""
echo "Pour corriger jusqu’au prochain reboot :  sudo sysctl vm.overcommit_memory=1"
echo "Pour appliquer via ce script :          APPLY=1 $0"
exit 0
