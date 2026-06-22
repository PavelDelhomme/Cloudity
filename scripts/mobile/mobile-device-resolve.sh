#!/usr/bin/env bash
# Résout le serial ADB à utiliser pour les tests mobile Cloudity.
# Priorité : CLOUDITY_DEVICE_ID / ANDROID_SERIAL → profil référence (connecté) → seul appareil → menu.
# Usage : source depuis mobile-test-common.inc.sh ou :
#   eval "$(./scripts/mobile/mobile-device-resolve.sh --export)"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_ID="${CLOUDITY_DEVICE_PROFILE:-samsung-sm-g990b2}"
PROFILE_DIR="${ROOT}/mobile/device-profiles/${PROFILE_ID}"
PROFILE_JSON="${PROFILE_DIR}/profile.json"

cloudity__adb_devices() {
  adb devices 2>/dev/null | awk '/\tdevice$/ {print $1}'
}

cloudity__device_model() {
  adb -s "$1" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || true
}

cloudity__device_manufacturer() {
  adb -s "$1" shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r\n' | tr '[:upper:]' '[:lower:]' || true
}

cloudity__matches_profile() {
  local serial="$1"
  local ref_model ref_mfg model mfg
  [[ -f "$PROFILE_JSON" ]] || return 1
  ref_model="$(python3 -c "import json; print(json.load(open('$PROFILE_JSON'))['hardware']['model'])" 2>/dev/null || true)"
  ref_mfg="$(python3 -c "import json; print(json.load(open('$PROFILE_JSON'))['hardware']['manufacturer'])" 2>/dev/null || true)"
  ref_serial="$(python3 -c "import json; print(json.load(open('$PROFILE_JSON')).get('reference_serial',''))" 2>/dev/null || true)"
  model="$(cloudity__device_model "$serial")"
  mfg="$(cloudity__device_manufacturer "$serial")"
  if [[ -n "$ref_serial" && "$serial" == "$ref_serial" ]]; then
    return 0
  fi
  [[ -n "$ref_model" && "$model" == "$ref_model" && -n "$ref_mfg" && "$mfg" == "$ref_mfg" ]]
}

cloudity_resolve_adb_serial() {
  local app_label="${1:-Cloudity}"
  local line serial
  local -a devs=()

  if [[ -n "${CLOUDITY_DEVICE_ID:-}" ]]; then
    printf '%s' "${CLOUDITY_DEVICE_ID}"
    return 0
  fi
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s' "${ANDROID_SERIAL}"
    return 0
  fi

  while IFS= read -r line; do
    [[ -n "$line" ]] && devs+=("$line")
  done < <(cloudity__adb_devices)

  if [[ ${#devs[@]} -eq 0 ]]; then
    return 1
  fi

  # Profil référence Samsung : préférer l'appareil qui correspond (évite l'émulateur si les deux sont branchés).
  if [[ -f "$PROFILE_JSON" ]]; then
    for serial in "${devs[@]}"; do
      if cloudity__matches_profile "$serial"; then
        echo "   → ADB profil ${PROFILE_ID} : ${serial}" >&2
        printf '%s' "$serial"
        return 0
      fi
    done
  fi

  if [[ ${#devs[@]} -eq 1 ]]; then
    echo "   → ADB : un appareil (${devs[0]})" >&2
    printf '%s' "${devs[0]}"
    return 0
  fi

  if [[ -t 0 ]] && [[ -t 1 ]]; then
    echo "Plusieurs appareils ADB (état « device ») :" >&2
    local PS3="Numéro à utiliser pour integration_test ${app_label} : "
    local choice
    select choice in "${devs[@]}"; do
      if [[ -n "${choice:-}" ]]; then
        printf '%s' "$choice"
        return 0
      fi
      echo "Choix invalide." >&2
    done
  fi

  echo "⚠️  Plusieurs appareils : ${devs[*]}" >&2
  echo "    Mode non interactif — utilisation du premier. Précisez : export CLOUDITY_DEVICE_ID=<serial>" >&2
  printf '%s' "${devs[0]}"
  return 0
}

if [[ "${1:-}" == "--export" ]]; then
  if ! command -v adb >/dev/null 2>&1; then
    echo "echo '❌ adb absent' >&2; exit 1" >&2
    exit 1
  fi
  serial="$(cloudity_resolve_adb_serial "export")" || exit 1
  printf 'export CLOUDITY_DEVICE_ID=%q\n' "$serial"
  exit 0
fi

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  cloudity_resolve_adb_serial "${1:-}"
fi
