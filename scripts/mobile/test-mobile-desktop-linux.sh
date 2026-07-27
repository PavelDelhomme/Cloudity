#!/usr/bin/env bash
# Validation Linux desktop Flutter (Drive, Photos, Pass).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# shellcheck source=mobile-flutter-env.sh
source "${ROOT}/scripts/mobile/mobile-flutter-env.sh"
if ! cloudity_prepare_flutter_env "$ROOT"; then
  echo "❌ Flutter requis — lancez : make ensure-flutter-sdk"
  exit 1
fi

apps=(drive photos pass)

for app in "${apps[@]}"; do
  app_dir="${ROOT}/mobile/${app}"
  label="$(tr '[:lower:]' '[:upper:]' <<< "${app:0:1}")${app:1}"
  if [[ ! -d "${app_dir}/linux" ]]; then
    echo "❌ ${label}: cible linux/ absente (${app_dir})."
    exit 1
  fi

  echo "🖥️  Cloudity ${label} Linux — flutter pub get"
  (cd "$app_dir" && flutter pub get)

  echo "🖥️  Cloudity ${label} Linux — flutter test"
  (cd "$app_dir" && flutter test)

  echo "🖥️  Cloudity ${label} Linux — flutter build linux --debug"
  (cd "$app_dir" && flutter build linux --debug)

  if [[ "${CLOUDITY_DESKTOP_RUN_SMOKE:-}" == "1" ]]; then
    timeout_s="${CLOUDITY_DESKTOP_RUN_TIMEOUT_SECONDS:-20}"
    echo "🖥️  Cloudity ${label} Linux — flutter run -d linux (${timeout_s}s max)"
    set +e
    (cd "$app_dir" && timeout "${timeout_s}s" flutter run -d linux --debug)
    code=$?
    set -e
    if [[ "$code" != "0" && "$code" != "124" ]]; then
      echo "❌ ${label}: flutter run -d linux a échoué (code ${code})."
      exit "$code"
    fi
    echo "✅ ${label}: run smoke terminé (code ${code}; 124 = timeout attendu après lancement)."
  fi
done

echo "✅ Linux desktop Drive/Photos/Pass : tests + builds debug OK."
