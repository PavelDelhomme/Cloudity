#!/usr/bin/env bash
# Charge l’env restic local VPS (repo chiffré sous ~/backups/restic-cloudity).
# Usage sur le VPS :
#   source ~/…/scripts/ops/restic-vps-env.sh   # ou copier ce fichier
#   restic snapshots
#
# Pour basculer vers S3 : remplir ~/.config/cloudity/restic-s3.env puis
#   set -a; source ~/.config/cloudity/restic-s3.env; set +a
set -euo pipefail

export PATH="${HOME}/bin:${PATH}"
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-${HOME}/backups/restic-cloudity}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-${HOME}/.config/cloudity/restic.password}"

if [[ ! -x "${HOME}/bin/restic" ]] && ! command -v restic >/dev/null 2>&1; then
  echo "❌ restic introuvable (~/bin/restic)." >&2
  return 1 2>/dev/null || exit 1
fi
if [[ ! -f "$RESTIC_PASSWORD_FILE" ]]; then
  echo "❌ $RESTIC_PASSWORD_FILE manquant." >&2
  return 1 2>/dev/null || exit 1
fi

echo "RESTIC_REPOSITORY=$RESTIC_REPOSITORY"
