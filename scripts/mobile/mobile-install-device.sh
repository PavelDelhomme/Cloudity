#!/usr/bin/env bash
# Installe sur un appareil Android (ADB) toutes les APK disponibles via OTA prod.
#
# Usage :
#   CLOUDITY_DEVICE_ID=192.168.1.184:5555 DEPLOY_URL=https://api.cloudity.delhomme.ovh ./scripts/mobile/mobile-install-device.sh
#   CLOUDITY_DEVICE_PROFILE=samsung-sm-g990b2 ./scripts/mobile/mobile-install-device.sh
#
# Variables :
#   APPS="Mail Drive Photos Pass"   # sous-ensemble
#   INSTALL_LOCAL=1                # dist/mobile-apk/*.apk au lieu d'OTA
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_URL="${DEPLOY_URL:-https://api.cloudity.delhomme.ovh}"
APPS="${APPS:-Mail Drive Photos Pass Calendar Contacts Notes Tasks Admin}"
TMP="${TMPDIR:-/tmp}/cloudity-apk-install"
mkdir -p "$TMP"

# shellcheck source=scripts/mobile/mobile-device-resolve.sh
source "$ROOT/scripts/mobile/mobile-device-resolve.sh"
SERIAL="$(cloudity_resolve_adb_serial "install OTA")" || {
  echo "❌ Aucun appareil ADB (brancher Samsung ou CLOUDITY_DEVICE_ID=…)" >&2
  exit 1
}
export ANDROID_SERIAL="$SERIAL"
echo "📱 Appareil : $SERIAL ($(cloudity__device_model "$SERIAL" 2>/dev/null || echo ?))"

app_slug() {
  case "$1" in
    Mail|mail) echo cloudity_mail ;;
    Drive|drive) echo cloudity_drive ;;
    Photos|photos) echo cloudity_photos ;;
    Pass|pass) echo cloudity_pass ;;
    Calendar|calendar) echo cloudity_calendar ;;
    Contacts|contacts) echo cloudity_contacts ;;
    Notes|notes) echo cloudity_notes ;;
    Tasks|tasks) echo cloudity_tasks ;;
    Admin|admin) echo cloudity_admin ;;
    *) echo "APP inconnu: $1" >&2; return 1 ;;
  esac
}

local_apk() {
  local slug="$1"
  local ver="${2:-0.1.0}"
  local p="$ROOT/dist/mobile-apk/${slug}-${ver}.apk"
  [[ -f "$p" ]] && echo "$p" && return 0
  ls "$ROOT/dist/mobile-apk/${slug}-"*.apk 2>/dev/null | head -1 || true
}

FAILED=0
OK=0
SKIP=0

for APP in $APPS; do
  slug="$(app_slug "$APP")" || { FAILED=$((FAILED + 1)); continue; }
  echo ""
  echo "════════════════════════════════════════"
  echo " $APP ($slug)"
  echo "════════════════════════════════════════"

  apk_path=""
  if [[ "${INSTALL_LOCAL:-0}" == "1" ]]; then
    apk_path="$(local_apk "$slug" || true)"
    if [[ -z "$apk_path" || ! -f "$apk_path" ]]; then
      echo "⏭️  Pas d'APK locale — skip"
      SKIP=$((SKIP + 1))
      continue
    fi
  else
    manifest_url="${DEPLOY_URL%/}/deploy/mobile/manifest?app=${slug}"
    manifest_json="$TMP/manifest-${slug}.json"
    code="$(curl -sS -o "$manifest_json" -w "%{http_code}" "$manifest_url" || echo 000)"
    if [[ "$code" != "200" ]]; then
      echo "⏭️  OTA indisponible (HTTP $code) — skip"
      SKIP=$((SKIP + 1))
      continue
    fi
    apk_url="$(python3 -c "import json; print(json.load(open('$manifest_json'))['apk_url'])" 2>/dev/null || true)"
    if [[ -z "$apk_url" ]]; then
      echo "⏭️  Manifeste sans apk_url — skip"
      SKIP=$((SKIP + 1))
      continue
    fi
    apk_path="$TMP/${slug}.apk"
    echo "    ↓ $apk_url"
    curl -fsSL -o "$apk_path" "$apk_url"
  fi

  echo "    adb install -r $(basename "$apk_path")"
  if adb -s "$SERIAL" install -r "$apk_path"; then
    echo "✅ $APP installé"
    OK=$((OK + 1))
  else
    echo "❌ $APP échec install" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Terminé : $OK installé(s), $SKIP absent(s) OTA, $FAILED échec(s)."
[[ "$FAILED" -eq 0 ]]
