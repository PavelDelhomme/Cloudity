#!/usr/bin/env bash
# Publie ou met à jour un manifeste version.json pour une app mobile Cloudity.
# Usage : APP=cloudity-mail VERSION=1.0.0+1 APK_URL=https://… SHA256=… ./scripts/ci/publish-mobile-manifest.sh
set -euo pipefail

APP="${APP:?APP requis (ex. cloudity-mail)}"
VERSION="${VERSION:?VERSION requis}"
APK_URL="${APK_URL:-}"
SHA256="${SHA256:-}"
MIN_SUPPORTED="${MIN_SUPPORTED:-$VERSION}"
OUT_DIR="${OUT_DIR:-./dist/mobile-manifests}"

mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/version-${APP}.json"

cat >"$MANIFEST" <<EOF
{
  "app": "$APP",
  "version": "$VERSION",
  "min_supported": "$MIN_SUPPORTED",
  "apk_url": "$APK_URL",
  "sha256": "$SHA256",
  "published_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Manifeste écrit : $MANIFEST"
cat "$MANIFEST"
