#!/bin/sh
# Copie go.mod, package-lock.json et requirements*.txt dans un arbre minimal
# pour CVE_SCAN_REPO_ROOT en prod (image admin-service GHCR).
# Usage : stage-scan-manifests.sh <source_repo> <dest_dir>
set -eu

SRC="${1:?source repo}"
DEST="${2:?dest dir}"

rm -rf "$DEST"
mkdir -p "$DEST"

cd "$SRC"

find . \
  \( -name go.mod -o -name package-lock.json -o -name 'requirements*.txt' \) \
  ! -path '*/node_modules/*' \
  ! -path '*/vendor/*' \
  ! -path '*/.git/*' \
  ! -path '*/dist/*' \
  ! -path '*/build/*' \
  -print0 | while IFS= read -r -d '' f; do
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$f" "$DEST/$f"
done

count="$(find "$DEST" -type f | wc -l | tr -d ' ')"
echo "CVE scan manifests staged: $count files -> $DEST"
