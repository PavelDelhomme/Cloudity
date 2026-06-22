#!/usr/bin/env bash
# Répare ou installe un SDK Flutter officiel utilisable sans root (Arch / snapshot).
# Appelé par mobile-flutter-env.sh, run-mobile.sh, mobile-doctor.sh, install-deps.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=mobile-flutter-env.sh
source "${ROOT}/scripts/mobile/mobile-flutter-env.sh"

if cloudity_prepare_flutter_env "$ROOT"; then
  if cloudity_flutter_sdk_healthcheck >/dev/null 2>&1; then
    echo "✅ SDK Flutter OK : ${FLUTTER_ROOT:-$(command -v flutter)}"
    flutter --version | sed -n '1,2p'
    exit 0
  fi
fi

echo "❌ Impossible de préparer un SDK Flutter fonctionnel."
exit 1
