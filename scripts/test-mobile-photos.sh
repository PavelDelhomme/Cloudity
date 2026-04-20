#!/usr/bin/env bash
# Tests Flutter Cloudity Photos : widget (hôte) + integration_test sur appareil ADB si disponible.
# La vérif « SDK inscriptible » (Gradle/Kotlin) ne s’applique qu’au build device, pas à flutter test hôte.
# Appelé par make tests (run-tests-with-report.sh). Usage direct : ./scripts/test-mobile-photos.sh
#
# Appareil : CLOUDITY_DEVICE_ID ou ANDROID_SERIAL ; sinon un seul « device » ADB auto ;
# plusieurs appareils + terminal interactif → menu select ; sinon premier serial + avertissement.
#
# E2E sur device (login réel, gateway joignable depuis le téléphone / émulateur) :
#   export CLOUDITY_E2E_GATEWAY='http://192.168.1.5:6080'   # IP LAN du PC (téléphone USB)
#   export CLOUDITY_E2E_GATEWAY='http://10.0.2.2:6080'     # émulateur Android
#   export CLOUDITY_E2E_EMAIL='admin@cloudity.local'
#   export CLOUDITY_E2E_PASSWORD='Admin123!'
#   export CLOUDITY_E2E_TENANT='1'   # optionnel
# Puis : make test-mobile-photos   (ou make tests avec la stack up + seed-admin)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHOTOS="$ROOT/mobile/photos"

if [[ ! -d "$PHOTOS" ]]; then
  echo "❌ Dossier mobile/photos introuvable."
  exit 1
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "⚠️  Flutter absent — phase « test-mobile-photos » ignorée (PATH sans flutter)."
  echo "    https://docs.flutter.dev/get-started/install"
  exit 0
fi

chmod +x "${ROOT}/scripts/check-flutter-sdk-writable.sh" 2>/dev/null || true

cd "$PHOTOS"

echo "📱 Cloudity Photos — flutter pub get"
flutter pub get

echo "📱 Cloudity Photos — flutter test (hôte, widget + unitaires)"
flutter test

if [[ "${CLOUDITY_SKIP_DEVICE_INTEGRATION:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_DEVICE_INTEGRATION=1 — pas d’integration_test sur appareil (arrêt après tests hôte)."
  exit 0
fi

pick_adb_serial() {
  local line
  local -a devs=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && devs+=("$line")
  done < <(adb devices 2>/dev/null | awk '/\tdevice$/ {print $1}')

  if [[ ${#devs[@]} -eq 0 ]]; then
    return 1
  fi

  # CLOUDITY_DEVICE_ID peut cibler un serial listé ailleurs (ex. reconnexion) ; get-state valide ensuite.
  if [[ -n "${CLOUDITY_DEVICE_ID:-}" ]]; then
    printf '%s' "${CLOUDITY_DEVICE_ID}"
    return 0
  fi
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s' "${ANDROID_SERIAL}"
    return 0
  fi
  if [[ ${#devs[@]} -eq 1 ]]; then
    echo "   → ADB : un appareil (${devs[0]})" >&2
    printf '%s' "${devs[0]}"
    return 0
  fi

  if [[ -t 0 ]] && [[ -t 1 ]]; then
    echo "Plusieurs appareils ADB (état « device ») :" >&2
    local PS3="Numéro à utiliser pour integration_test Photos : "
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

if ! command -v adb >/dev/null 2>&1; then
  echo "ℹ️  adb absent — integration_test sur appareil ignorée (tests hôte déjà OK)."
  exit 0
fi

SERIAL="$(pick_adb_serial)" || {
  echo "ℹ️  Aucun appareil ADB autorisé (« device ») — integration_test sur appareil ignorée."
  echo "    Branchez le téléphone (débogage USB) ou lancez un émulateur ; vérifiez : adb devices"
  exit 0
}

if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || echo missing)" != "device" ]]; then
  echo "❌ adb -s « ${SERIAL} » get-state ≠ device (appareil absent, unauthorized ou offline ?)."
  exit 1
fi

# Gradle écrit du Kotlin sous packages/flutter_tools/gradle — requis pour le build APK de
# l’integration_test, pas pour « flutter test » sur VM hôte (déjà exécuté ci-dessus).
if ! CLOUDITY_QUIET_FLUTTER_SDK_CHECK=1 "${ROOT}/scripts/check-flutter-sdk-writable.sh"; then
  echo ""
  echo "ℹ️  SDK Flutter non inscriptible (ex. /usr/lib/flutter en root sur Arch) :"
  echo "    integration_test sur appareil ignorée — les tests hôte ci-dessus sont valides."
  echo "    Pour lancer sur device : sudo chown -R \"\$(whoami)\" \"<racine Flutter>\" ou Flutter dans \$HOME en premier dans le PATH."
  echo "    Contournement avancé (risque d’échec Gradle) : CLOUDITY_SKIP_FLUTTER_SDK_CHECK=1"
  exit 0
fi

echo "📱 Cloudity Photos — integration_test sur « ${SERIAL} »"
DEFS=()
[[ -n "${CLOUDITY_E2E_GATEWAY:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_GATEWAY="${CLOUDITY_E2E_GATEWAY}")
[[ -n "${CLOUDITY_E2E_EMAIL:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_EMAIL="${CLOUDITY_E2E_EMAIL}")
[[ -n "${CLOUDITY_E2E_PASSWORD:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_PASSWORD="${CLOUDITY_E2E_PASSWORD}")
[[ -n "${CLOUDITY_E2E_TENANT:-}" ]] && DEFS+=(--dart-define=CLOUDITY_E2E_TENANT="${CLOUDITY_E2E_TENANT}")

if [[ ${#DEFS[@]} -eq 0 ]]; then
  echo "ℹ️  Sans CLOUDITY_E2E_GATEWAY / EMAIL / PASSWORD : seul le smoke « démarrage » s’exécute sur l’appareil ;"
  echo "    le test « connexion + timeline » est ignoré côté Dart (skip)."
else
  echo "ℹ️  Scénario E2E device : connexion + timeline (gateway joignable depuis l’appareil requis)."
fi

flutter test integration_test/photos_flow_test.dart -d "$SERIAL" "${DEFS[@]}"
echo "✅ test-mobile-photos : integration_test sur device OK."
