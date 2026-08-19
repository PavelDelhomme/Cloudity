#!/usr/bin/env bash
# Tests mobile sur AVD Cloudity (Cloudity_S21_FE / emulator-5556).
# Démarre l'AVD si besoin, vérifie la stack gateway, lance la suite ou une app.
#
# Usage :
#   ./scripts/mobile/test-mobile-avd.sh              # Photos → Drive → Mail
#   ./scripts/mobile/test-mobile-avd.sh photos
#   ./scripts/mobile/test-mobile-avd.sh drive
#   ./scripts/mobile/test-mobile-avd.sh mail
#
# Variables :
#   CLOUDITY_AVD_ENSURE_STACK=1   (défaut) curl health gateway ; sinon make up + seed-dev-users
#   CLOUDITY_AVD_SKIP_STACK=1     ne touche pas à Docker
#   CLOUDITY_AVD_USE_SYSTEMD=1    lance qemu via systemd-run --user (plus stable hors TTY)
#   CLOUDITY_GATEWAY_PORT         défaut 6002
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${1:-suite}"
GATEWAY_PORT="${CLOUDITY_GATEWAY_PORT:-6002}"
ENSURE_STACK="${CLOUDITY_AVD_ENSURE_STACK:-1}"
SKIP_STACK="${CLOUDITY_AVD_SKIP_STACK:-0}"

export CLOUDITY_DEVICE_PROFILE="${CLOUDITY_DEVICE_PROFILE:-cloudity-avd-s21-fe}"
export CLOUDITY_DEVICE_ID="${CLOUDITY_DEVICE_ID:-emulator-5556}"
export ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5556}"
export CLOUDITY_GATEWAY_PORT="$GATEWAY_PORT"
export CLOUDITY_REPO_ROOT="$ROOT"

cloudity__gateway_ok() {
  curl -sf "http://127.0.0.1:${GATEWAY_PORT}/health" >/dev/null 2>&1
}

cloudity__ensure_stack() {
  if [[ "$SKIP_STACK" == "1" ]]; then
    echo "ℹ️  CLOUDITY_AVD_SKIP_STACK=1 — stack non vérifiée."
    return 0
  fi
  if cloudity__gateway_ok; then
    echo "✅ Gateway :${GATEWAY_PORT} OK"
    return 0
  fi
  if [[ "$ENSURE_STACK" != "1" ]]; then
    echo "⚠️  Gateway :${GATEWAY_PORT} absente — lancez make up puis make seed-dev-users"
    return 1
  fi
  echo "⏳ Stack absente — make up + seed-dev-users…"
  make -C "$ROOT" up
  make -C "$ROOT" wait-for-services
  make -C "$ROOT" seed-dev-users
  if ! cloudity__gateway_ok; then
    echo "❌ Gateway :${GATEWAY_PORT} toujours injoignable après make up."
    return 1
  fi
  echo "✅ Stack prête (gateway :${GATEWAY_PORT})"
}

chmod +x "${ROOT}/scripts/mobile/mobile-emulator-cloudity.sh" \
  "${ROOT}/scripts/mobile/test-mobile-suite.sh" \
  "${ROOT}/scripts/mobile/test-mobile-app.sh" \
  "${ROOT}/scripts/mobile/mobile-test-common.inc.sh" \
  "${ROOT}/scripts/mobile/mobile-device-resolve.sh" 2>/dev/null || true

cloudity__ensure_stack

echo "📱 Démarrage / réutilisation AVD Cloudity…"
"${ROOT}/scripts/mobile/mobile-emulator-cloudity.sh"

echo "   → Profil ${CLOUDITY_DEVICE_PROFILE} · serial ${CLOUDITY_DEVICE_ID} · gateway :${GATEWAY_PORT}"

case "$APP" in
  suite|all)
    exec "${ROOT}/scripts/mobile/test-mobile-suite.sh"
    ;;
  photos|drive|mail)
    exec "${ROOT}/scripts/mobile/test-mobile-app.sh" "$APP"
    ;;
  *)
    echo "Usage: $0 [suite|photos|drive|mail]"
    exit 1
    ;;
esac
