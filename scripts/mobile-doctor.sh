#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=mobile-flutter-env.sh
source "${ROOT}/scripts/mobile-flutter-env.sh"

echo "== Cloudity Mobile Doctor =="
echo ""

if ! cloudity_prepare_flutter_env "$ROOT"; then
  echo "❌ Flutter introuvable."
  exit 1
fi

echo "Flutter binaire : $(command -v flutter)"
echo "FLUTTER_ROOT    : ${FLUTTER_ROOT:-<non défini>}"
flutter --version | sed -n '1,3p'
echo ""

KOTLIN_HOME_DEFAULT="${HOME}/.cache/cloudity-kotlin"
export KOTLIN_USER_HOME="${KOTLIN_USER_HOME:-$KOTLIN_HOME_DEFAULT}"
mkdir -p "$KOTLIN_USER_HOME"
if [[ "${GRADLE_OPTS:-}" != *"kotlin.project.persistent.dir="* ]]; then
  export GRADLE_OPTS="${GRADLE_OPTS:-} -Dkotlin.project.persistent.dir=${KOTLIN_USER_HOME}"
fi
echo "KOTLIN_USER_HOME: ${KOTLIN_USER_HOME}"
echo "GRADLE_OPTS     : ${GRADLE_OPTS}"
echo ""

if CLOUDITY_ALLOW_READONLY_FLUTTER_SDK=1 "${ROOT}/scripts/check-flutter-sdk-writable.sh"; then
  echo "✅ Vérification SDK Flutter: OK"
else
  echo "❌ Vérification SDK Flutter: KO"
  exit 1
fi
echo ""

if command -v adb >/dev/null 2>&1; then
  echo "ADB:"
  adb start-server >/dev/null 2>&1 || true
  adb devices -l
  if adb devices 2>/dev/null | rg -q "unauthorized"; then
    echo ""
    echo "⚠️  Un appareil est unauthorized."
    echo "    Lancez: make mobile-adb-authorize"
    echo "    Puis acceptez la clé RSA sur le téléphone."
  fi
else
  echo "⚠️  adb introuvable (installez android-tools)."
fi

echo ""
echo "Doctor terminé."
