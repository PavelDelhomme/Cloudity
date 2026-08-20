#!/usr/bin/env bash
# Met à jour Portainer CE avec backup du conteneur + volume data.
#
# Usage (sur le VPS, en root ou user docker) :
#   curl -fsSL …  # ou scp ce script
#   ./scripts/ops/upgrade-portainer.sh
#   TARGET=2.39.6 ./scripts/ops/upgrade-portainer.sh
#
# Ne touche PAS aux stacks applicatives (Cloudity, Nextcloud, NPM…).
set -euo pipefail

TARGET="${TARGET:-2.39.6}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/portainer-backup-$(date +%Y%m%d-%H%M%S)}"
CONTAINER="${PORTAINER_CONTAINER:-portainer}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "❌ Conteneur « $CONTAINER » introuvable. Liste :"
  docker ps -a --format '{{.Names}}\t{{.Image}}' | grep -i portainer || docker ps -a
  echo "   Relance avec : PORTAINER_CONTAINER=<nom> $0"
  exit 1
fi

IMAGE_CURRENT="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER")"
echo "════════════════════════════════════════════════════════"
echo " Portainer upgrade → ${TARGET}"
echo " Conteneur actuel : ${CONTAINER} (${IMAGE_CURRENT})"
echo " Backup           : ${BACKUP_DIR}"
echo "════════════════════════════════════════════════════════"

mkdir -p "$BACKUP_DIR"

# 1) Sauvegarde de la config docker run (rejouable)
docker inspect "$CONTAINER" >"$BACKUP_DIR/inspect.json"
# Arguments utiles
docker inspect -f '{{json .HostConfig.Binds}}' "$CONTAINER" >"$BACKUP_DIR/binds.json"
docker inspect -f '{{json .HostConfig.PortBindings}}' "$CONTAINER" >"$BACKUP_DIR/ports.json"
docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Type}}){{"\n"}}{{end}}' "$CONTAINER" \
  | tee "$BACKUP_DIR/mounts.txt"

# Volume data Portainer (souvent /data)
DATA_SRC=""
while IFS= read -r line; do
  case "$line" in
    *"/data ("*|*"/data\t"*|*"> /data "*)
      DATA_SRC="$(echo "$line" | awk '{print $1}')"
      ;;
  esac
done <"$BACKUP_DIR/mounts.txt"

# Parse mounts more reliably
DATA_SRC="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$CONTAINER")"
if [[ -z "$DATA_SRC" ]]; then
  echo "⚠️  Pas de mount /data détecté — backup conteneur seul (inspect.json)."
else
  echo "📦 Backup volume data : $DATA_SRC"
  if [[ -d "$DATA_SRC" ]]; then
    sudo tar -C "$(dirname "$DATA_SRC")" -czf "$BACKUP_DIR/portainer-data.tgz" "$(basename "$DATA_SRC")" \
      || tar -C "$(dirname "$DATA_SRC")" -czf "$BACKUP_DIR/portainer-data.tgz" "$(basename "$DATA_SRC")"
  else
    # named volume
    docker run --rm -v "$DATA_SRC":/from:ro -v "$BACKUP_DIR":/to alpine \
      tar -C /from -czf /to/portainer-data.tgz .
  fi
fi

# 2) Stop + rename (rollback = démarrer portainer_backup_*)
STAMP="$(date +%Y%m%d-%H%M%S)"
OLD_NAME="${CONTAINER}_backup_${STAMP}"
echo "🛑 Stop + rename → ${OLD_NAME}"
docker stop "$CONTAINER"
docker rename "$CONTAINER" "$OLD_NAME"

# 3) Recréer avec la même config (ports / binds) via image cible
echo "⬇️  Pull portainer/portainer-ce:${TARGET}"
docker pull "portainer/portainer-ce:${TARGET}"

# Rejouer les binds et ports depuis l’ancien conteneur
BINDS=()
while IFS= read -r b; do
  [[ -n "$b" ]] && BINDS+=(-v "$b")
done < <(docker inspect -f '{{range .HostConfig.Binds}}{{println .}}{{end}}' "$OLD_NAME")

# Ports host
PORT_ARGS=()
# shellcheck disable=SC2016
while IFS=$'\t' read -r hostport containerport; do
  [[ -n "$hostport" ]] && PORT_ARGS+=(-p "${hostport}:${containerport}")
done < <(docker inspect -f '{{range $p, $conf := .HostConfig.PortBindings}}{{range $conf}}{{printf "%s\t%s\n" .HostPort $p}}{{end}}{{end}}' "$OLD_NAME" | sed 's|/tcp||')

RESTART="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$OLD_NAME")"
[[ -z "$RESTART" || "$RESTART" == "no" ]] && RESTART="always"

echo "🚀 Start nouveau Portainer…"
docker run -d \
  --name "$CONTAINER" \
  --restart="$RESTART" \
  "${PORT_ARGS[@]}" \
  "${BINDS[@]}" \
  "portainer/portainer-ce:${TARGET}"

echo ""
echo "✅ Portainer ${TARGET} démarré."
echo "   Ancien conteneur conservé : ${OLD_NAME} (ne pas supprimer tout de suite)"
echo "   Backup fichiers           : ${BACKUP_DIR}"
echo ""
echo "Rollback si besoin :"
echo "  docker stop ${CONTAINER} && docker rm ${CONTAINER}"
echo "  docker rename ${OLD_NAME} ${CONTAINER} && docker start ${CONTAINER}"
echo ""
echo "Quand tout est OK (24–48h) :"
echo "  docker rm ${OLD_NAME}"
echo "  rm -rf ${BACKUP_DIR}"
