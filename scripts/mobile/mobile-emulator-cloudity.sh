#!/usr/bin/env bash
# Démarre l'AVD Cloudity dédié (copie Samsung S21 FE) en parallèle de l'émulateur existant.
# Usage : make mobile-emulator-cloudity-start
#   CLOUDITY_AVD_NAME=Cloudity_S21_FE CLOUDITY_AVD_PORT=5556 (défauts)
set -euo pipefail

AVD_NAME="${CLOUDITY_AVD_NAME:-Cloudity_S21_FE}"
AVD_PORT="${CLOUDITY_AVD_PORT:-5556}"
SERIAL="emulator-${AVD_PORT}"
LOG_FILE="/tmp/cloudity-avd-${AVD_NAME}.log"

cloudity_android_sdk_root() {
  local candidate
  for candidate in \
    "${ANDROID_SDK_ROOT:-}" \
    "${ANDROID_HOME:-}" \
    "${HOME}/Android/Sdk" \
    "/opt/android-sdk"; do
    [[ -n "$candidate" && -x "${candidate}/emulator/emulator" && -d "${candidate}/system-images" ]] || continue
    printf '%s' "$candidate"
    return 0
  done
  return 1
}

SDK_ROOT="$(cloudity_android_sdk_root || true)"
EMULATOR="${SDK_ROOT:+$SDK_ROOT/emulator/emulator}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ ! -d "${HOME}/.android/avd/${AVD_NAME}.avd" ]]; then
  chmod +x "${ROOT}/scripts/mobile/mobile-emulator-cloudity-create.sh"
  "${ROOT}/scripts/mobile/mobile-emulator-cloudity-create.sh"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb requis."
  exit 1
fi
if [[ -z "${SDK_ROOT:-}" || ! -x "${EMULATOR:-}" ]]; then
  echo "❌ SDK Android introuvable (emulator + system-images). Installez le SDK ou exportez ANDROID_SDK_ROOT."
  exit 1
fi
if [[ ! -d "${HOME}/.android/avd/${AVD_NAME}.avd" ]]; then
  echo "❌ AVD ${AVD_NAME} absent. Créez-le (clone Samsung) ou ajustez CLOUDITY_AVD_NAME."
  exit 1
fi

cloudity__running_serial() {
  local serial name
  while IFS= read -r serial; do
    [[ -z "$serial" ]] && continue
    name="$(adb -s "$serial" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r\n' || true)"
    if [[ "$name" == "$AVD_NAME" ]]; then
      printf '%s' "$serial"
      return 0
    fi
  done < <(adb devices 2>/dev/null | awk '/emulator-.*\tdevice$/ {print $1}')
  return 1
}

if running="$(cloudity__running_serial)"; then
  echo "✅ AVD ${AVD_NAME} déjà actif : ${running} (JobbingTrack / autre émulateur inchangé)"
  exit 0
fi

echo "🚀 Démarrage AVD ${AVD_NAME} sur le port ${AVD_PORT} (SDK=${SDK_ROOT}, parallèle à emulator-5554)…"
ANDROID_SDK_ROOT="$SDK_ROOT" ANDROID_HOME="$SDK_ROOT" nohup "$EMULATOR" -avd "$AVD_NAME" -port "$AVD_PORT" -no-snapshot-load -no-boot-anim >"$LOG_FILE" 2>&1 &
emu_pid=$!
echo "   PID ${emu_pid} · logs : ${LOG_FILE}"

echo "   Attente ADB ${SERIAL}…"
adb -s "$SERIAL" wait-for-device

boot_timeout=180
elapsed=0
while [[ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)" != "1" ]]; do
  if ! kill -0 "$emu_pid" 2>/dev/null; then
    echo "❌ L'émulateur s'est arrêté. Voir ${LOG_FILE}"
    tail -20 "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
  if (( elapsed >= boot_timeout )); then
    echo "❌ Timeout boot ${SERIAL} (${boot_timeout}s). Voir ${LOG_FILE}"
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

name="$(adb -s "$SERIAL" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r\n')"
size="$(adb -s "$SERIAL" shell wm size 2>/dev/null | awk '/Physical size/ {print $3}' | tr -d '\r\n')"
density="$(adb -s "$SERIAL" shell wm density 2>/dev/null | awk '/Physical density/ {print $3}' | tr -d '\r\n')"
echo "✅ ${SERIAL} prêt — AVD=${name} · écran=${size} · dpi=${density}"
