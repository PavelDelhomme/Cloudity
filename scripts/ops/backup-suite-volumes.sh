#!/usr/bin/env bash
# backup-suite-volumes.sh — inventaire + archive des volumes Docker critiques (suite Cloudity)
# À lancer SUR LE VPS (ou via SSH). Ne prune JAMAIS, ne Remove jamais de volumes.
#
# Usage:
#   ./scripts/ops/backup-suite-volumes.sh              # dry-run : liste volumes + tailles
#   ./scripts/ops/backup-suite-volumes.sh --run        # tar.gz locaux dans BACKUP_DIR
#   BACKUP_DIR=~/backups/cloudity-suite ./scripts/ops/backup-suite-volumes.sh --run
#
# Plus tard (non implémenté ici) : restic → S3 / stockage externe chiffré.
set -euo pipefail

# Défaut : $HOME (writable sans root). /var/backups nécessite sudo.
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups/cloudity-suite}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN=0
[[ "${1:-}" == "--run" ]] && RUN=1

# Noms stables Portainer — ne pas renommer
CRITICAL_VOLUMES=(
  gasoil_api_data
  ytmusic_ytmusic_data
  jobbingtrack-prod_postgres_data
  cloudity_postgres_data
  cloudity_mobile_data
)

echo "==> backup-suite-volumes  stamp=$STAMP  mode=$([ "$RUN" -eq 1 ] && echo RUN || echo DRY-RUN)"
echo "==> BACKUP_DIR=$BACKUP_DIR"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable — lancer sur le VPS." >&2
  exit 1
fi

list_matching() {
  docker volume ls -q | while read -r v; do
    for want in "${CRITICAL_VOLUMES[@]}"; do
      if [[ "$v" == "$want" || "$v" == *"$want"* ]]; then
        echo "$v"
      fi
    done
  done | sort -u
}

VOLS="$(list_matching || true)"
if [[ -z "$VOLS" ]]; then
  echo "⚠️  Aucun volume critique trouvé (noms exacts ou contenant)."
  echo "    Volumes présents :"
  docker volume ls
  exit 0
fi

echo "Volumes ciblés :"
while read -r v; do
  [[ -z "$v" ]] && continue
  # Taille approximative via alpine du volume
  size="$(docker run --rm -v "$v":/data alpine du -sh /data 2>/dev/null | awk '{print $1}' || echo '?')"
  echo "  - $v  (~$size)"
done <<<"$VOLS"
echo

if [[ "$RUN" -eq 0 ]]; then
  echo "Dry-run OK. Relancer avec --run pour créer des archives tar.gz."
  echo "Exemple : BACKUP_DIR=\$HOME/backups/cloudity-suite $0 --run"
  exit 0
fi

mkdir -p "$BACKUP_DIR" || {
  echo "❌ Impossible de créer BACKUP_DIR=$BACKUP_DIR (permissions ?)." >&2
  echo "   Exemple : BACKUP_DIR=\$HOME/backups/cloudity-suite $0 --run" >&2
  exit 1
}
MANIFEST="$BACKUP_DIR/manifest-$STAMP.txt"
{
  echo "stamp=$STAMP"
  echo "host=$(hostname 2>/dev/null || echo unknown)"
  echo "volumes:"
} >"$MANIFEST"

while read -r v; do
  [[ -z "$v" ]] && continue
  out="$BACKUP_DIR/${v}-$STAMP.tar.gz"
  echo "==> Archive $v → $out"
  docker run --rm \
    -v "$v":/data:ro \
    -v "$BACKUP_DIR":/backup \
    alpine \
    tar -czf "/backup/$(basename "$out")" -C /data .
  echo "  $v → $(basename "$out")" >>"$MANIFEST"
done <<<"$VOLS"

echo
echo "✅ Terminé. Manifest : $MANIFEST"
echo "⚠️  Stocker hors VPS (copie scp / S3) — restic chiffré = étape suivante non codée."
