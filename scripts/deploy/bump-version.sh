#!/usr/bin/env bash
# Incrémente la version sémantique (source unique : ./VERSION).
# Usage:
#   bash scripts/deploy/bump-version.sh patch   # 0.1.0 → 0.1.1
#   bash scripts/deploy/bump-version.sh minor   # 0.1.0 → 0.2.0
#   bash scripts/deploy/bump-version.sh major   # 0.1.0 → 1.0.0
# Affichage runtime : d+X.Y.Z (dev/local) · p+X.Y.Z (prod HTTPS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PART="${1:-patch}"
FILE="$ROOT/VERSION"

if [[ ! -f "$FILE" ]]; then
  echo "0.1.0" >"$FILE"
fi
CUR="$(tr -d '[:space:]' <"$FILE")"
IFS=. read -r MA MI PA <<<"$CUR"
MA=${MA:-0}; MI=${MI:-0}; PA=${PA:-0}

case "$PART" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch) PA=$((PA + 1)) ;;
  *)
    echo "Usage: $0 major|minor|patch" >&2
    exit 2
    ;;
esac

NEXT="${MA}.${MI}.${PA}"
echo "$NEXT" >"$FILE"

if [[ -f "$ROOT/frontend/package.json" ]]; then
  node -e "
    const fs=require('fs');
    const p=process.argv[1];
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version=process.argv[2];
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  " "$ROOT/frontend/package.json" "$NEXT" 2>/dev/null || true
fi

CODE=$((MA * 10000 + MI * 100 + PA))
echo "==> VERSION $CUR → $NEXT (versionCode Android=$CODE)"
echo "    Affichage : d+$NEXT (local/dev) · p+$NEXT (prod)"
echo "    Pense à : make publish-ghcr REF=prod  ·  make mobile-publish APP=Mail"
