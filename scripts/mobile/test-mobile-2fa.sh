#!/usr/bin/env bash
# Tests integration_test 2FA sur appareil ADB (Drive, Mail, Photos).
# Prérequis : make up, téléphone même LAN, adb devices.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=mobile-test-common.inc.sh
source "${ROOT}/scripts/mobile/mobile-test-common.inc.sh"
# shellcheck source=mobile-flutter-env.sh
source "${ROOT}/scripts/mobile/mobile-flutter-env.sh"

chmod +x "${ROOT}/scripts/dev/prepare-e2e-2fa-mobile.sh" "${ROOT}/scripts/dev/generate-totp.mjs"

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb requis pour test-mobile-2fa"
  exit 1
fi

SERIAL="$(cloudity_pick_adb_serial "2FA")" || {
  echo "❌ Aucun appareil ADB (device)"
  exit 1
}

if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || echo missing)" != "device" ]]; then
  echo "❌ adb -s ${SERIAL} non prêt"
  exit 1
fi

cloudity_prepare_e2e_env "$SERIAL"

if [[ -z "${CLOUDITY_E2E_GATEWAY:-}" ]]; then
  echo "❌ CLOUDITY_E2E_GATEWAY introuvable (Wi‑Fi / ip route / CLOUDITY_E2E_NO_AUTO=1 + export manuel)"
  exit 1
fi

echo "📱 Préparation compte 2FA (API)…"
CLOUDITY_E2E_GATEWAY="${CLOUDITY_E2E_GATEWAY}" "${ROOT}/scripts/dev/prepare-e2e-2fa-mobile.sh"
# shellcheck source=/dev/null
source "${ROOT}/reports/e2e-2fa-mobile.env"

cloudity_prepare_flutter_env "$ROOT" || true

if ! command -v flutter >/dev/null 2>&1; then
  echo "❌ Flutter absent"
  exit 1
fi

if ! CLOUDITY_ALLOW_READONLY_FLUTTER_SDK=1 CLOUDITY_QUIET_FLUTTER_SDK_CHECK=1 \
  "${ROOT}/scripts/mobile/check-flutter-sdk-writable.sh"; then
  echo "❌ SDK Flutter non inscriptible — build Android impossible"
  exit 1
fi

run_twofa_app() {
  local app_key="$1"
  local app_dir="$2"
  local int_file="$3"
  local label="$4"

  echo ""
  echo "📱 2FA — ${label} sur ${SERIAL} (gateway ${CLOUDITY_E2E_GATEWAY})"
  CLOUDITY_E2E_2FA_CODE="$(node "${ROOT}/scripts/dev/generate-totp.mjs" "${CLOUDITY_E2E_TOTP_SECRET}")"
  echo "   → Code TOTP frais (6 chiffres) généré pour ce run"

  cd "$app_dir"
  flutter pub get
  flutter test "$int_file" -d "$SERIAL" \
    --dart-define=CLOUDITY_E2E_GATEWAY="${CLOUDITY_E2E_GATEWAY}" \
    --dart-define=CLOUDITY_E2E_EMAIL="${CLOUDITY_E2E_EMAIL}" \
    --dart-define=CLOUDITY_E2E_PASSWORD="${CLOUDITY_E2E_PASSWORD}" \
    --dart-define=CLOUDITY_E2E_TENANT="${CLOUDITY_E2E_TENANT}" \
    --dart-define=CLOUDITY_E2E_2FA_CODE="${CLOUDITY_E2E_2FA_CODE}" \
    --dart-define=CLOUDITY_E2E_TOTP_SECRET="${CLOUDITY_E2E_TOTP_SECRET}"
  echo "✅ 2FA ${label} OK"
}

run_twofa_app drive "${ROOT}/mobile/drive" integration_test/twofa_flow_test.dart Drive
run_twofa_app mail "${ROOT}/mobile/mail" integration_test/twofa_flow_test.dart Mail
run_twofa_app photos "${ROOT}/mobile/photos" integration_test/twofa_flow_test.dart Photos

echo ""
echo "✅ test-mobile-2fa : Drive + Mail + Photos (2FA TOTP sur appareil)"
