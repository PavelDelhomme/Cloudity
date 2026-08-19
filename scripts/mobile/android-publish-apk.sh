#!/usr/bin/env bash
# Build APK debug/release Cloudity et publie manifeste OTA local.
# Usage : APP=Mail|Drive|Photos|Pass ./scripts/mobile/android-publish-apk.sh
# Variables :
#   CLOUDITY_FLAVOR=dev|prod   (défaut prod si DEPLOY_URL en https)
#   BUILD_MODE=debug|release
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${APP:-Mail}"
VERSION="$(tr -d '[:space:]' <"$ROOT/VERSION" 2>/dev/null || echo 0.1.0)"
BUILD_MODE="${BUILD_MODE:-release}"
OUT_DIR="${OUT_DIR:-$ROOT/dist/mobile-apk}"
MANIFEST_DIR="${MANIFEST_DIR:-$ROOT/dist/mobile-manifests}"

case "$APP" in
  Mail|mail) APP_DIR="$ROOT/mobile/mail"; PKG="cloudity_mail"; ANDROID_PKG="fr.cloudity.cloudity_mail" ;;
  Drive|drive) APP_DIR="$ROOT/mobile/drive"; PKG="cloudity_drive"; ANDROID_PKG="fr.cloudity.cloudity_drive" ;;
  Photos|photos) APP_DIR="$ROOT/mobile/photos"; PKG="cloudity_photos"; ANDROID_PKG="fr.cloudity.cloudity_photos" ;;
  Pass|pass) APP_DIR="$ROOT/mobile/pass"; PKG="cloudity_pass"; ANDROID_PKG="fr.cloudity.cloudity_pass" ;;
  *)
    echo "APP inconnu : $APP (Mail|Drive|Photos|Pass)" >&2
    exit 1
    ;;
esac

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ Dossier $APP_DIR introuvable" >&2
  exit 1
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "❌ Flutter requis (PATH)" >&2
  exit 1
fi

GATEWAY_URL="${CLOUDITY_MOBILE_GATEWAY_URL:-${VITE_API_URL:-http://127.0.0.1:6002}}"
if [[ -n "${DEPLOY_URL:-}" ]]; then
  GATEWAY_URL="${DEPLOY_URL%/}"
  [[ "$GATEWAY_URL" == */api ]] || GATEWAY_URL="${DEPLOY_URL%/}/api"
  if [[ "$DEPLOY_URL" == https://* ]]; then
    GATEWAY_URL="${DEPLOY_URL/https:\/\//https://api.}"
  fi
fi

mkdir -p "$OUT_DIR"
APK_NAME="${PKG}-${VERSION}.apk"
APK_PATH="$OUT_DIR/$APK_NAME"

echo "📱 Build $APP ($BUILD_MODE) — gateway $GATEWAY_URL"
cd "$APP_DIR"
flutter pub get
flutter build apk --"$BUILD_MODE" \
  --dart-define=CLOUDITY_GATEWAY_URL="$GATEWAY_URL" \
  --dart-define=CLOUDITY_APP_VERSION="$VERSION"

SRC_APK="$APP_DIR/build/app/outputs/flutter-apk/app-${BUILD_MODE}.apk"
cp "$SRC_APK" "$APK_PATH"
SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"

APK_URL="${APK_URL:-file://$APK_PATH}"
if [[ -n "${DEPLOY_URL:-}" ]]; then
  APK_URL="${DEPLOY_URL%/}/api/deploy/apk/${PKG}/${VERSION}"
fi

APP="$PKG" VERSION="$VERSION" APK_URL="$APK_URL" SHA256="$SHA256" \
  OUT_DIR="$MANIFEST_DIR" "$ROOT/scripts/ci/publish-mobile-manifest.sh"

echo "✅ APK : $APK_PATH"
echo "   SHA256 : $SHA256"
echo "   Manifeste : $MANIFEST_DIR/version-${PKG}.json"
