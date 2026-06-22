#!/usr/bin/env bash
# Crée l'AVD Cloudity_S21_FE (copie Samsung S21 FE) à partir de JobbingTrack_S21_FE si absent.
# Usage : ./scripts/mobile/mobile-emulator-cloudity-create.sh
set -euo pipefail

AVD_NAME="${CLOUDITY_AVD_NAME:-Cloudity_S21_FE}"
SRC_NAME="${CLOUDITY_AVD_SOURCE:-JobbingTrack_S21_FE}"
AVD_HOME="${ANDROID_AVD_HOME:-${HOME}/.android/avd}"
SRC_DIR="${AVD_HOME}/${SRC_NAME}.avd"
DST_DIR="${AVD_HOME}/${AVD_NAME}.avd"
SRC_INI="${AVD_HOME}/${SRC_NAME}.ini"
DST_INI="${AVD_HOME}/${AVD_NAME}.ini"

if [[ -d "$DST_DIR" ]]; then
  echo "✅ AVD ${AVD_NAME} existe déjà : ${DST_DIR}"
  exit 0
fi
if [[ ! -d "$SRC_DIR" ]]; then
  echo "❌ AVD source introuvable : ${SRC_DIR}"
  exit 1
fi

echo "📋 Clone ${SRC_NAME} → ${AVD_NAME} (1080×2340 @ 480 dpi, indépendant)…"
cp -a "$SRC_DIR" "$DST_DIR"
sed "s|${SRC_NAME}|${AVD_NAME}|g" "$SRC_INI" > "$DST_INI"

# Samsung golden : 480 dpi
sed -i 's/^hw\.lcd\.density = .*/hw.lcd.density = 480/' "$DST_DIR/config.ini"
sed -i 's/^hw\.device\.hash2 = .*/hw.device.hash2 = MD5:cloudity-s21-fe-avd-480dpi/' "$DST_DIR/config.ini"

# État propre + identité distincte (pas de partage JobbingTrack)
rm -rf "$DST_DIR/snapshots" "$DST_DIR/hardware-qemu.ini" "$DST_DIR/hardware-qemu.ini.lock" \
  "$DST_DIR/emu-launch-params.txt" "$DST_DIR/multiinstance.lock" "$DST_DIR/read-snapshot.txt" 2>/dev/null || true
rm -f "$DST_DIR/userdata-qemu.img" "$DST_DIR/userdata-qemu.img.qcow2" 2>/dev/null || true

echo "✅ AVD ${AVD_NAME} prêt. Démarrez avec : make mobile-emulator-cloudity-start"
