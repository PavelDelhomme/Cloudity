#!/usr/bin/env bash
# restic-suite-s3.sh — backup chiffré des volumes critiques → repo restic (S3 / compatible).
# À lancer SUR LE VPS. Ne prune JAMAIS, ne Remove jamais de volumes Docker.
#
# Prérequis : restic, docker, credentials S3.
#
# Variables (obligatoires pour --run) :
#   RESTIC_REPOSITORY   ex. s3:s3.amazonaws.com/bucket/cloudity-suite
#                       ou   s3:https://s3.example.com/bucket/cloudity-suite
#   RESTIC_PASSWORD     passphrase repo (ou RESTIC_PASSWORD_FILE)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (ou équivalent fournisseur)
#
# Optionnel :
#   RESTIC_CACHE_DIR    défaut ~/.cache/restic
#   BACKUP_TAG          défaut cloudity-suite
#   INCLUDE_YTMUSIC=1   inclut ytmusic_ytmusic_data (~22G) — hors heures recommandé
#
# Usage :
#   ./scripts/ops/restic-suite-s3.sh              # dry-run inventaire
#   ./scripts/ops/restic-suite-s3.sh --init       # restic init (une fois)
#   ./scripts/ops/restic-suite-s3.sh --run        # snapshot
#   ./scripts/ops/restic-suite-s3.sh --snapshots  # liste
#   ./scripts/ops/restic-suite-s3.sh --check      # vérif intégrité
set -euo pipefail

TAG="${BACKUP_TAG:-cloudity-suite}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MODE=dry
case "${1:-}" in
  --init) MODE=init ;;
  --run) MODE=run ;;
  --snapshots) MODE=snapshots ;;
  --check) MODE=check ;;
  ""|--dry-run) MODE=dry ;;
  -h|--help)
    sed -n '2,30p' "$0"
    exit 0
    ;;
  *)
    echo "Usage: $0 [--dry-run|--init|--run|--snapshots|--check]" >&2
    exit 2
    ;;
esac

CRITICAL_VOLUMES=(
  cloudity_postgres_data
  cloudity_mobile_data
  gasoil_api_data
  jobbingtrack-prod_postgres_data
)
if [[ "${INCLUDE_YTMUSIC:-0}" == "1" ]]; then
  CRITICAL_VOLUMES+=(ytmusic_ytmusic_data)
fi

echo "==> restic-suite-s3  stamp=$STAMP  mode=$MODE  tag=$TAG"
echo "==> INCLUDE_YTMUSIC=${INCLUDE_YTMUSIC:-0}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable — lancer sur le VPS." >&2
  exit 1
fi
if ! command -v restic >/dev/null 2>&1; then
  echo "❌ restic introuvable. Installer : https://restic.net/" >&2
  echo "   Debian/Ubuntu : apt install restic   |   ou binaire GitHub releases." >&2
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
echo "Volumes ciblés :"
if [[ -z "$VOLS" ]]; then
  echo "  (aucun trouvé)"
  docker volume ls | head -20
else
  while read -r v; do
    [[ -z "$v" ]] && continue
    size="$(docker run --rm -v "$v":/data alpine du -sh /data 2>/dev/null | awk '{print $1}' || echo '?')"
    echo "  - $v  (~$size)"
  done <<<"$VOLS"
fi
echo

require_restic_env() {
  if [[ -z "${RESTIC_REPOSITORY:-}" ]]; then
    echo "❌ RESTIC_REPOSITORY manquant (ex. s3:s3.eu-west-3.amazonaws.com/mon-bucket/cloudity)." >&2
    exit 1
  fi
  if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
    echo "❌ RESTIC_PASSWORD ou RESTIC_PASSWORD_FILE requis." >&2
    exit 1
  fi
  echo "==> RESTIC_REPOSITORY=$RESTIC_REPOSITORY"
}

case "$MODE" in
  dry)
    echo "Dry-run OK. Exporter RESTIC_* + AWS_* puis relancer --init (1×) puis --run."
    echo "Exemple :"
    echo "  export RESTIC_REPOSITORY=s3:s3.eu-west-3.amazonaws.com/BUCKET/cloudity-suite"
    echo "  export RESTIC_PASSWORD='…'"
    echo "  export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…"
    echo "  $0 --init && $0 --run"
    exit 0
    ;;
  snapshots)
    require_restic_env
    restic snapshots --tag "$TAG"
    exit 0
    ;;
  check)
    require_restic_env
    restic check
    exit 0
    ;;
  init)
    require_restic_env
    restic init
    echo "✅ Repo initialisé."
    exit 0
    ;;
  run)
    require_restic_env
    if [[ -z "$VOLS" ]]; then
      echo "❌ Aucun volume à archiver." >&2
      exit 1
    fi
    TMP="$(mktemp -d /tmp/cloudity-restic-XXXXXX)"
    cleanup() { rm -rf "$TMP"; }
    trap cleanup EXIT
    echo "==> Export tar → $TMP puis restic backup"
    while read -r v; do
      [[ -z "$v" ]] && continue
      out="$TMP/${v}.tar"
      echo "  tar $v…"
      docker run --rm -v "$v":/data:ro -v "$TMP":/out alpine \
        tar -cf "/out/$(basename "$out")" -C /data .
    done <<<"$VOLS"
    restic backup "$TMP" \
      --tag "$TAG" \
      --tag "stamp:$STAMP" \
      --host "$(hostname -s 2>/dev/null || echo vps)"
    echo "✅ Snapshot restic OK (tag=$TAG stamp=$STAMP)."
    echo "   Vérifier : $0 --snapshots"
    echo "   ⚠️  Les tar temporaires sont effacés ; le contenu chiffré est dans le repo S3."
    ;;
esac
