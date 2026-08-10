#!/usr/bin/env bash
# Arrêt EXPLICITE de l’AVD Cloudity uniquement (jamais appelé par test-mobile-avd).
# Usage : make mobile-emulator-cloudity-stop
set -euo pipefail

AVD_NAME="${CLOUDITY_AVD_NAME:-Cloudity_S21_FE}"
AVD_PORT="${CLOUDITY_AVD_PORT:-5556}"
SERIAL="emulator-${AVD_PORT}"
PID_FILE="/tmp/cloudity-avd-${AVD_NAME}.pid"

echo "🛑 Arrêt AVD ${AVD_NAME} (${SERIAL})…"

# 1) adb emu kill si connecté
if adb devices 2>/dev/null | awk -v s="$SERIAL" '$1==s && $2=="device" {found=1} END{exit !found}'; then
  adb -s "$SERIAL" emu kill >/dev/null 2>&1 || true
  sleep 2
fi

# 2) PIDs qemu / emulator pour cet AVD (pas le shell/make)
pids=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  bin="$(awk '{print $2}' <<<"$line")"
  case "$bin" in
    */qemu-system-*|*/emulator|qemu-system-*|emulator) ;;
    *) continue ;;
  esac
  if [[ "$line" == *"-avd ${AVD_NAME}"* || "$line" == *"-avd=${AVD_NAME}"* \
     || "$line" == *"-port ${AVD_PORT}"* || "$line" == *"-port=${AVD_PORT}"* ]]; then
    pids+="$(awk '{print $1}' <<<"$line")"$'\n'
  fi
done < <(ps -eo pid=,args= 2>/dev/null || true)
pids="$(printf '%s' "$pids" | sort -u | tr '\n' ' ' | xargs || true)"

if [[ -n "${pids}" ]]; then
  echo "   kill ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
  sleep 2
  # shellcheck disable=SC2086
  kill -9 ${pids} 2>/dev/null || true
fi

if [[ -f "$PID_FILE" ]]; then
  old="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$old" ]] && kill "$old" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

echo "✅ AVD ${AVD_NAME} arrêté (Samsung physiques / autres émulateurs non touchés)."
