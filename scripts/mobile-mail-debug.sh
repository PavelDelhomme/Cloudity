#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=mobile-test-common.inc.sh
source "${ROOT}/scripts/mobile-test-common.inc.sh"

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb introuvable (Android platform-tools)."
  exit 1
fi

SERIAL="${ADB_SERIAL:-${ANDROID_SERIAL:-}}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$(cloudity_pick_adb_serial "Mail")" || {
    echo "❌ Aucun appareil ADB détecté."
    exit 1
  }
fi

if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || true)" != "device" ]]; then
  echo "❌ Appareil ADB indisponible: ${SERIAL}"
  exit 1
fi

mkdir -p "${ROOT}/reports"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${ROOT}/reports/mobile-mail-logcat-${STAMP}.log"

echo "📱 Device: ${SERIAL}"
echo "🧹 Nettoyage logcat…"
adb -s "$SERIAL" logcat -c

echo "📡 Capture logcat → ${OUT}"
adb -s "$SERIAL" logcat -v time >"$OUT" 2>&1 &
LOGCAT_PID=$!

cleanup() {
  if kill -0 "$LOGCAT_PID" >/dev/null 2>&1; then
    kill "$LOGCAT_PID" >/dev/null 2>&1 || true
    wait "$LOGCAT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "🧪 Lancement test mobile mail…"
"${ROOT}/scripts/test-mobile-mail.sh"

cleanup
trap - EXIT INT TERM
echo "✅ Session terminée. Logs: ${OUT}"
