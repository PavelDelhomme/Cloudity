#!/usr/bin/env bash
# Build + upload APK vers l'instance prod Cloudity (route gateway/admin à brancher).
# Usage : DEPLOY_URL=https://cloudity.example APP=Mail ./scripts/mobile/publish-apk-remote.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${APP:-Mail}"
DEPLOY_URL="${DEPLOY_URL:?DEPLOY_URL requis (ex. https://cloudity.delhomme.ovh)}"
TOKEN="${APK_UPLOAD_TOKEN:-${CLOUDITY_APK_UPLOAD_TOKEN:-}}"

BUILD_FIRST="${BUILD_FIRST:-1}"
if [[ "$BUILD_FIRST" == "1" ]]; then
  APP="$APP" DEPLOY_URL="$DEPLOY_URL" "$ROOT/scripts/mobile/android-publish-apk.sh"
fi

case "$APP" in
  Mail|mail) PKG="cloudity_mail" ;;
  Drive|drive) PKG="cloudity_drive" ;;
  Photos|photos) PKG="cloudity_photos" ;;
  Pass|pass) PKG="cloudity_pass" ;;
  *) echo "APP inconnu" >&2; exit 1 ;;
esac

VERSION="$(tr -d '[:space:]' <"$ROOT/VERSION" 2>/dev/null || echo 0.1.0)"
APK_PATH="${OUT_DIR:-$ROOT/dist/mobile-apk}/${PKG}-${VERSION}.apk"

if [[ ! -f "$APK_PATH" ]]; then
  echo "❌ APK absent : $APK_PATH" >&2
  exit 1
fi

UPLOAD_URL="${DEPLOY_URL%/}/api/admin/mobile/apk/upload"
echo "📤 Upload → $UPLOAD_URL"

curl_args=(-sfS -X POST -F "app=${PKG}" -F "version=${VERSION}" -F "apk=@${APK_PATH}")
if [[ -n "$TOKEN" ]]; then
  curl_args+=(-H "Authorization: Bearer ${TOKEN}")
fi

if curl "${curl_args[@]}" "$UPLOAD_URL"; then
  echo ""
  echo "✅ APK publiée — GET ${DEPLOY_URL%/}/api/deploy/apk/${PKG}"
else
  echo "⚠️  Upload API non disponible (route à implémenter côté gateway)."
  echo "   APK locale prête : $APK_PATH"
  echo "   Copie manuelle ou volume Portainer : cloudity_mobile_data"
  exit 0
fi
