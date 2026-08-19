#!/usr/bin/env bash
# Résolution SDK Android — préfère ~/Android/Sdk si ANDROID_SDK_ROOT est invalide.
# Usage : source scripts/mobile/mobile-android-sdk.inc.sh
#   cloudity_android_sdk_root → stdout chemin SDK ou exit 1
#   cloudity_android_sdk_export → export ANDROID_SDK_ROOT / ANDROID_HOME / PATH
set -euo pipefail

cloudity__sdk_valid() {
  local candidate="$1"
  [[ -n "$candidate" && -x "${candidate}/emulator/emulator" && -d "${candidate}/system-images" ]]
}

cloudity_android_sdk_root() {
  local candidate
  # ~/Android/Sdk en premier : évite un ANDROID_SDK_ROOT cassé (/opt/android-sdk absent).
  for candidate in \
    "${HOME}/Android/Sdk" \
    "${ANDROID_SDK_ROOT:-}" \
    "${ANDROID_HOME:-}" \
    "/opt/android-sdk"; do
    [[ -n "$candidate" ]] || continue
    if cloudity__sdk_valid "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

cloudity_android_sdk_export() {
  local sdk
  sdk="$(cloudity_android_sdk_root)" || return 1
  export ANDROID_SDK_ROOT="$sdk"
  export ANDROID_HOME="$sdk"
  export PATH="${sdk}/emulator:${sdk}/platform-tools:${sdk}/cmdline-tools/latest/bin:${PATH}"
}
