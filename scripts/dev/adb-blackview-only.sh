#!/usr/bin/env bash
# adb-blackview-only.sh — force ANDROID_SERIAL = Blackview BV9700Pro.
# Usage :
#   source scripts/dev/adb-blackview-only.sh
#   adb shell getprop ro.product.model   # → BV9700Pro
#
# Ne cible jamais Samsung / autres appareils branchés en parallèle.
set -euo pipefail

BLACKVIEW_SERIAL="${CLOUDITY_BLACKVIEW_SERIAL:-EEA9700PRO0014587}"
ADB_BIN="${ADB_BIN:-$(command -v adb || true)}"
[[ -z "$ADB_BIN" && -x "${HOME}/Android/Sdk/platform-tools/adb" ]] && ADB_BIN="${HOME}/Android/Sdk/platform-tools/adb"
if [[ -z "$ADB_BIN" ]]; then
  echo "❌ adb introuvable" >&2
  return 1 2>/dev/null || exit 1
fi

if ! "$ADB_BIN" devices | awk 'NR>1 && $2=="device" {print $1}' | grep -qx "$BLACKVIEW_SERIAL"; then
  echo "❌ Blackview ($BLACKVIEW_SERIAL) non connecté ou non autorisé." >&2
  "$ADB_BIN" devices -l >&2 || true
  return 1 2>/dev/null || exit 1
fi

export ANDROID_SERIAL="$BLACKVIEW_SERIAL"
export ADB="$ADB_BIN"
echo "✅ ANDROID_SERIAL=$ANDROID_SERIAL (Blackview only — autres appareils ignorés)"
