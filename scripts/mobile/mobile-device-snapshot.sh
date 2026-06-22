#!/usr/bin/env bash
# Capture une empreinte ADB « golden » d'un appareil physique dans le dépôt (sans secrets).
# Usage :
#   CLOUDITY_DEVICE_ID=R5CT7263YJL make mobile-device-snapshot
#   make mobile-device-snapshot   # utilise le profil samsung-sm-g990b2 si connecté
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=mobile-device-resolve.sh
source "${ROOT}/scripts/mobile/mobile-device-resolve.sh"

PROFILE_SLUG="${CLOUDITY_DEVICE_PROFILE:-samsung-sm-g990b2}"
OUT_DIR="${ROOT}/mobile/device-profiles/${PROFILE_SLUG}"
PROFILE_JSON="${OUT_DIR}/profile.json"
GETPROP_SNAP="${OUT_DIR}/getprop.snapshot"

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb requis (android-tools)."
  exit 1
fi

SERIAL="${CLOUDITY_DEVICE_ID:-}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$(cloudity_resolve_adb_serial "snapshot")" || {
    echo "❌ Aucun appareil ADB. Branchez le Samsung ou export CLOUDITY_DEVICE_ID=…"
    exit 1
  }
fi

if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || echo missing)" != "device" ]]; then
  echo "❌ adb -s ${SERIAL} non prêt (autorisez USB debugging sur le téléphone)."
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "📸 Snapshot appareil ${SERIAL} → ${OUT_DIR}/"

adb -s "$SERIAL" shell getprop >"$GETPROP_SNAP"

MODEL="$(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r\n')"
MFG="$(adb -s "$SERIAL" shell getprop ro.product.manufacturer | tr -d '\r\n' | tr '[:upper:]' '[:lower:]')"
DEVICE="$(adb -s "$SERIAL" shell getprop ro.product.device | tr -d '\r\n')"
RELEASE="$(adb -s "$SERIAL" shell getprop ro.build.version.release | tr -d '\r\n')"
SDK="$(adb -s "$SERIAL" shell getprop ro.build.version.sdk | tr -d '\r\n')"
ABI="$(adb -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r\n')"
WM_SIZE="$(adb -s "$SERIAL" shell wm size 2>/dev/null | awk '/Physical size/ {print $3}' | tr -d '\r\n')"
WM_DENSITY="$(adb -s "$SERIAL" shell wm density 2>/dev/null | awk '/Physical density/ {print $3}' | tr -d '\r\n')"
GATEWAY_PORT="${CLOUDITY_GATEWAY_PORT:-${PORT_GATEWAY:-6002}}"

PACKAGES="$(adb -s "$SERIAL" shell pm list packages 2>/dev/null | rg 'fr\.cloudity\.' | sed 's/package://' | tr -d '\r' | sort | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"

CAPTURED_AT="$(date -Iseconds)"

python3 - <<PY
import json
from pathlib import Path

out = Path("${PROFILE_JSON}")
getprop_path = Path("${GETPROP_SNAP}")
props = {}
for line in getprop_path.read_text(encoding="utf-8", errors="replace").splitlines():
    if not line.strip():
        continue
    # format: [key]: [value]
    if line.startswith("[") and "]: [" in line:
        k, _, rest = line.partition("]: [")
        key = k[1:]
        val = rest.rstrip("]")
        props[key] = val

profile = {
    "profile_id": "${PROFILE_SLUG}",
    "display_name": f"Samsung {props.get('ro.product.model', '${MODEL}')} ({props.get('ro.product.device', '${DEVICE}')})",
    "reference_serial": "${SERIAL}",
    "captured_at": "${CAPTURED_AT}",
    "hardware": {
        "manufacturer": "${MFG}",
        "model": "${MODEL}",
        "device": "${DEVICE}",
        "android_release": "${RELEASE}",
        "sdk": "${SDK}",
        "abi": "${ABI}",
        "screen_px": "${WM_SIZE}",
        "density_dpi": int("${WM_DENSITY}" or 0) or None,
    },
    "adb": {
        "gateway_reverse_port": int("${GATEWAY_PORT}"),
        "notes": "Tests USB : adb reverse tcp:<port> tcp:<port> puis gateway http://127.0.0.1:<port>",
    },
    "cloudity_packages": json.loads('''${PACKAGES}'''),
    "getprop_fingerprint": {
        k: props[k]
        for k in (
            "ro.product.manufacturer",
            "ro.product.model",
            "ro.product.device",
            "ro.build.version.release",
            "ro.build.version.sdk",
            "ro.product.cpu.abi",
            "ro.board.platform",
            "ro.hardware",
        )
        if k in props
    },
}

out.write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"✅ {out}")
PY

echo "   getprop complet : ${GETPROP_SNAP}"
echo "   Profil protégé (référence uniquement, pas de tokens / comptes)."
echo "   Tests auto : export CLOUDITY_DEVICE_PROFILE=${PROFILE_SLUG} make test-mobile-suite"
