#!/usr/bin/env bash
# Nettoie les conteneurs Cloudity **Exited (0)** one-shot (migrate, auth-keys-init, mobile-releases-init).
# Ne supprime PAS les services Up ni les Exited avec code ≠ 0 (investiguer d'abord).
#
# Usage VPS : bash scripts/deploy/prune-cloudity-oneshots.sh
# Dry-run   : DRY_RUN=1 bash scripts/deploy/prune-cloudity-oneshots.sh
set -euo pipefail

DRY="${DRY_RUN:-0}"
PATTERN='cloudity-(db-migrate|auth-keys-init|mobile-releases-init)'

mapfile -t ids < <(
  docker ps -a --filter "status=exited" --format '{{.ID}} {{.Names}} {{.Status}}' \
    | grep -E "$PATTERN" \
    | awk '$0 ~ /Exited \(0\)/ {print $1}' || true
)

if [[ ${#ids[@]} -eq 0 ]]; then
  echo "Aucun one-shot Exited (0) à nettoyer."
  exit 0
fi

echo "One-shots Exited (0) à supprimer : ${#ids[@]}"
docker ps -a --filter "status=exited" --format 'table {{.Names}}\t{{.Status}}' | grep -E "$PATTERN" || true

if [[ "$DRY" == "1" ]]; then
  echo "(dry-run — rien supprimé)"
  exit 0
fi

for id in "${ids[@]}"; do
  docker rm "$id" 2>/dev/null || true
done
echo "✅ Nettoyage terminé. Au prochain « Update stack », Portainer recréera les one-shots si besoin."
