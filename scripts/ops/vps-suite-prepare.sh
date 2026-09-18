#!/usr/bin/env bash
# À lancer SUR le VPS (ssh pavel-server) — préparation suite sans toucher aux volumes.
# Usage:
#   ./scripts/ops/vps-suite-prepare.sh           # dry-run backup + ensure network
#   ./scripts/ops/vps-suite-prepare.sh --backup  # archive tar.gz volumes critiques
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP="$ROOT/scripts/ops/backup-suite-volumes.sh"
DO_BACKUP=0
[[ "${1:-}" == "--backup" ]] && DO_BACKUP=1

echo "==> cloudity-bridge (réseau Docker partagé, anticipation hub)"
if docker network inspect cloudity-bridge >/dev/null 2>&1; then
  echo "    déjà présent"
else
  docker network create cloudity-bridge
  echo "    créé"
fi

echo
echo "==> Inventaire volumes critiques (dry-run backup)"
chmod +x "$BACKUP"
"$BACKUP"

if [[ "$DO_BACKUP" -eq 1 ]]; then
  echo
  echo "==> Archive volumes → BACKUP_DIR=${BACKUP_DIR:-$HOME/backups/cloudity-suite}"
  BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/cloudity-suite}" "$BACKUP" --run
  echo "⚠️  Copier les tar.gz hors VPS (scp / S3). restic chiffré = pas encore codé."
fi

echo
echo "OK — ne jamais docker volume prune / Remove des volumes listés."
