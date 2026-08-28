#!/usr/bin/env bash
# Build + upload APK vers la gateway Cloudity (OTA HTTPS).
# Usage :
#   DEPLOY_URL=https://api.cloudity.delhomme.ovh APP=Mail MOBILE_APK_UPLOAD_TOKEN=… ./scripts/mobile/publish-apk-remote.sh
#   DEPLOY_URL=http://127.0.0.1:6002 APP=Mail MOBILE_APK_UPLOAD_TOKEN=… ./scripts/mobile/publish-apk-remote.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${APP:-Mail}"
DEPLOY_URL="${DEPLOY_URL:?DEPLOY_URL requis (ex. https://api.cloudity.delhomme.ovh)}"
TOKEN="${MOBILE_APK_UPLOAD_TOKEN:-${APK_UPLOAD_TOKEN:-${CLOUDITY_APK_UPLOAD_TOKEN:-}}}"

# Normalise vers l’hôte API (pas le front web).
normalize_api_base() {
  local u="${1%/}"
  if [[ "$u" == https://cloudity.* || "$u" == https://cloudity.*/* ]]; then
    u="${u/https:\/\/cloudity./https://api.cloudity.}"
  fi
  # retire un éventuel suffixe /api (legacy scripts)
  u="${u%/api}"
  printf '%s' "$u"
}

API_BASE="$(normalize_api_base "$DEPLOY_URL")"

BUILD_FIRST="${BUILD_FIRST:-1}"
if [[ "$BUILD_FIRST" == "1" ]]; then
  APP="$APP" DEPLOY_URL="$API_BASE" "$ROOT/scripts/mobile/android-publish-apk.sh"
fi

case "$APP" in
  Mail|mail) PKG="cloudity_mail" ;;
  Drive|drive) PKG="cloudity_drive" ;;
  Photos|photos) PKG="cloudity_photos" ;;
  Pass|pass) PKG="cloudity_pass" ;;
  Calendar|calendar) PKG="cloudity_calendar" ;;
  Contacts|contacts) PKG="cloudity_contacts" ;;
  Notes|notes) PKG="cloudity_notes" ;;
  Tasks|tasks) PKG="cloudity_tasks" ;;
  *) echo "APP inconnu" >&2; exit 1 ;;
esac

VERSION="$(tr -d '[:space:]' <"$ROOT/VERSION" 2>/dev/null || echo 0.1.0)"
APK_PATH="${OUT_DIR:-$ROOT/dist/mobile-apk}/${PKG}-${VERSION}.apk"

if [[ ! -f "$APK_PATH" ]]; then
  echo "❌ APK absent : $APK_PATH" >&2
  exit 1
fi

UPLOAD_URL="${API_BASE}/deploy/mobile/upload"
echo "📤 Upload → $UPLOAD_URL (app=$PKG version=$VERSION)"

curl_args=(-sfS -X POST -F "app=${PKG}" -F "version=${VERSION}" -F "apk=@${APK_PATH}")
if [[ -n "$TOKEN" ]]; then
  curl_args+=(-H "Authorization: Bearer ${TOKEN}")
else
  echo "⚠️  MOBILE_APK_UPLOAD_TOKEN vide — upload refusée sans token/JWT admin" >&2
fi

if curl "${curl_args[@]}" "$UPLOAD_URL"; then
  echo ""
  echo "✅ APK publiée"
  echo "   Manifeste : ${API_BASE}/deploy/mobile/manifest?app=${PKG}"
  echo "   APK       : ${API_BASE}/deploy/apk/${PKG}/${VERSION}"
else
  echo "❌ Upload échoué" >&2
  echo "   APK locale : $APK_PATH" >&2
  exit 1
fi
