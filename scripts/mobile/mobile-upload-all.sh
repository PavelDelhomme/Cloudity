#!/usr/bin/env bash
# Build + upload OTA pour plusieurs apps mobiles Cloudity.
# Usage :
#   DEPLOY_URL=https://api.cloudity.delhomme.ovh MOBILE_APK_UPLOAD_TOKEN=… ./scripts/mobile/mobile-upload-all.sh
#   APPS="Mail Drive Photos Pass" ./scripts/mobile/mobile-upload-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_URL="${DEPLOY_URL:?DEPLOY_URL requis (ex. https://api.cloudity.delhomme.ovh)}"
APPS="${APPS:-Mail Drive Photos Pass Calendar Contacts Notes Tasks Admin}"
FAILED=0

for APP in $APPS; do
  echo ""
  echo "════════════════════════════════════════"
  echo " OTA → $APP"
  echo "════════════════════════════════════════"
  if APP="$APP" DEPLOY_URL="$DEPLOY_URL" BUILD_FIRST="${BUILD_FIRST:-1}" \
    "$ROOT/scripts/mobile/publish-apk-remote.sh"; then
    echo "✅ $APP OK"
  else
    echo "❌ $APP échec" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [[ "$FAILED" -gt 0 ]]; then
  echo "Terminé avec $FAILED échec(s)." >&2
  exit 1
fi
echo "Toutes les apps publiées ($APPS)."
