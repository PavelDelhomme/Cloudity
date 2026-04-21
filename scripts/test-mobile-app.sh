#!/usr/bin/env bash
# Tests Flutter Cloudity (Photos, Drive, Mail) : widget hôte + integration_test ADB si dispo.
# Usage : ./scripts/test-mobile-app.sh photos|drive|mail
# Variables : identiques à test-mobile-photos historique (voir scripts/mobile-test-common.inc.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_KEY="${1:-}"
shift || true

case "$APP_KEY" in
  photos)
    APP_DIR="$ROOT/mobile/photos"
    APP_LABEL="Photos"
    INT_FILE="integration_test/photos_flow_test.dart"
    ;;
  drive)
    APP_DIR="$ROOT/mobile/drive"
    APP_LABEL="Drive"
    INT_FILE="integration_test/drive_flow_test.dart"
    ;;
  mail)
    APP_DIR="$ROOT/mobile/mail"
    APP_LABEL="Mail"
    INT_FILE="integration_test/mail_flow_test.dart"
    ;;
  *)
    echo "Usage: $0 photos|drive|mail"
    exit 1
    ;;
esac

# shellcheck source=mobile-test-common.inc.sh
source "${ROOT}/scripts/mobile-test-common.inc.sh"

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ Dossier ${APP_DIR} introuvable."
  exit 1
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "⚠️  Flutter absent — ${APP_LABEL} ignoré (PATH sans flutter)."
  exit 0
fi

chmod +x "${ROOT}/scripts/check-flutter-sdk-writable.sh" 2>/dev/null || true

cd "$APP_DIR"

echo "📱 Cloudity ${APP_LABEL} — flutter pub get"
flutter pub get

echo "📱 Cloudity ${APP_LABEL} — flutter test (hôte)"
flutter test

if [[ "${CLOUDITY_SKIP_DEVICE_INTEGRATION:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_DEVICE_INTEGRATION=1 — pas d’integration_test sur appareil (${APP_LABEL})."
  exit 0
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "ℹ️  adb absent — integration_test ${APP_LABEL} sur appareil ignorée."
  exit 0
fi

SERIAL="$(cloudity_pick_adb_serial "$APP_LABEL")" || {
  echo "ℹ️  Aucun appareil ADB — integration_test ${APP_LABEL} ignorée."
  exit 0
}

if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || echo missing)" != "device" ]]; then
  echo "❌ adb -s « ${SERIAL} » get-state ≠ device."
  exit 1
fi

cloudity_prepare_e2e_env "$SERIAL"

if ! CLOUDITY_QUIET_FLUTTER_SDK_CHECK=1 "${ROOT}/scripts/check-flutter-sdk-writable.sh"; then
  echo ""
  echo "ℹ️  SDK Flutter non inscriptible : integration_test ${APP_LABEL} ignorée (tests hôte OK)."
  echo "    sudo chown -R \"\$(whoami)\" /usr/lib/flutter   # ou Flutter dans \$HOME"
  exit 0
fi

if [[ ! -f "$APP_DIR/$INT_FILE" ]]; then
  echo "ℹ️  Fichier $INT_FILE absent — pas d’integration_test device pour ${APP_LABEL}."
  exit 0
fi

echo "📱 Cloudity ${APP_LABEL} — integration_test sur « ${SERIAL} »"
DEFS=()
[[ -n "${CLOUDITY_E2E_GATEWAY:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_GATEWAY="${CLOUDITY_E2E_GATEWAY}")
[[ -n "${CLOUDITY_E2E_EMAIL:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_EMAIL="${CLOUDITY_E2E_EMAIL}")
[[ -n "${CLOUDITY_E2E_PASSWORD:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_PASSWORD="${CLOUDITY_E2E_PASSWORD}")
[[ -n "${CLOUDITY_E2E_TENANT:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_TENANT="${CLOUDITY_E2E_TENANT}")

if [[ ${#DEFS[@]} -eq 0 ]]; then
  echo "ℹ️  Sans gateway E2E : smoke device uniquement (login complet en skip côté Dart)."
else
  echo "ℹ️  E2E device ${APP_LABEL} : connexion + écran principal (make up + seed-admin requis)."
fi

flutter test "$INT_FILE" -d "$SERIAL" "${DEFS[@]}"
echo "✅ test-mobile-app ${APP_LABEL} : integration_test device OK."
