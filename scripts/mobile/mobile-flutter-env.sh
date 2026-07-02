#!/usr/bin/env bash
# shellcheck shell=bash
#
# Prépare un environnement Flutter exécutable sans droits root.
# - SDK officiel GitHub (stable) dans ~/.local/share/cloudity-flutter
# - Détecte et supprime les wrappers Arch cassés (snapshot /usr/lib/flutter)
# - Répare automatiquement si `flutter --version` échoue
#
# Usage:
#   source scripts/mobile/mobile-flutter-env.sh
#   cloudity_prepare_flutter_env

set -euo pipefail

cloudity_default_local_flutter_root() {
  local root="${CLOUDITY_LOCAL_FLUTTER_ROOT:-$HOME/.local/share/cloudity-flutter}"
  if [[ ! -x "$root/bin/flutter" && -x "$HOME/.cache/cloudity/flutter-sdk/bin/flutter" ]]; then
    root="$HOME/.cache/cloudity/flutter-sdk"
  fi
  printf '%s' "$root"
}

# Vrai SDK Flutter (pas le wrapper Arch qui pointe vers /usr/lib/flutter).
cloudity_flutter_is_official_sdk() {
  local sdk_root="$1"
  [[ -x "$sdk_root/bin/flutter" ]] || return 1
  [[ -d "$sdk_root/packages/flutter_tools" ]] || return 1
  if grep -q 'FLUTTER_ROOT="${FLUTTER_ROOT:-/usr/lib/flutter}"' "$sdk_root/bin/flutter" 2>/dev/null; then
    return 1
  fi
  if grep -q 'SNAPSHOT_PATH="$FLUTTER_ROOT/bin/cache/flutter_tools.snapshot"' "$sdk_root/bin/flutter" 2>/dev/null \
    && ! grep -q 'shared.sh' "$sdk_root/bin/flutter" 2>/dev/null; then
    return 1
  fi
  return 0
}

cloudity_flutter_sdk_healthcheck() {
  local sdk_root="${1:-${FLUTTER_ROOT:-}}"
  if [[ -z "$sdk_root" ]]; then
    command -v flutter >/dev/null 2>&1 || return 1
    local flutter_bin
    flutter_bin="$(command -v flutter)"
    if command -v realpath >/dev/null 2>&1; then
      flutter_bin="$(realpath "$flutter_bin")"
    fi
    sdk_root="$(cd "$(dirname "$flutter_bin")/.." && pwd)"
  fi
  cloudity_flutter_is_official_sdk "$sdk_root" || return 1
  (
    export FLUTTER_ROOT="$sdk_root"
    export PATH="${sdk_root}/bin:${PATH}"
    unset DART_ROOT
    flutter --version >/dev/null 2>&1
  )
}

cloudity_install_official_flutter_sdk() {
  local local_root="$1"
  echo "📦 Installation du SDK Flutter officiel (stable) dans : $local_root"
  if ! command -v git >/dev/null 2>&1; then
    echo "❌ git requis pour installer Flutter."
    return 1
  fi
  rm -rf "$local_root"
  mkdir -p "$(dirname "$local_root")"
  git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$local_root"

  export FLUTTER_ROOT="$local_root"
  export PATH="${FLUTTER_ROOT}/bin:${PATH}"
  unset DART_ROOT

  flutter config --no-analytics >/dev/null 2>&1 || true
  flutter --version
  flutter precache --android >/dev/null 2>&1 || flutter precache >/dev/null 2>&1 || true
}

cloudity_ensure_local_flutter_sdk() {
  local local_root
  local_root="$(cloudity_default_local_flutter_root)"
  if cloudity_flutter_sdk_healthcheck "$local_root"; then
    export FLUTTER_ROOT="$local_root"
    export PATH="${FLUTTER_ROOT}/bin:${PATH}"
    unset DART_ROOT
    return 0
  fi
  echo "⚠️  SDK Flutter local invalide ou snapshot cassé — réinstallation…"
  cloudity_install_official_flutter_sdk "$local_root"
  export FLUTTER_ROOT="$local_root"
  export PATH="${FLUTTER_ROOT}/bin:${PATH}"
  unset DART_ROOT
}

cloudity_prepare_flutter_env() {
  local _root="${1:-}"

  if [[ -n "${FLUTTER_ROOT:-}" ]] && cloudity_flutter_sdk_healthcheck "${FLUTTER_ROOT}"; then
    export PATH="${FLUTTER_ROOT}/bin:${PATH}"
    unset DART_ROOT
    return 0
  fi

  # SDK Cloudity dédié (évite le wrapper Arch /usr/lib/flutter cassé ; n’affecte pas les autres projets).
  local local_root
  local_root="$(cloudity_default_local_flutter_root)"
  if cloudity_flutter_sdk_healthcheck "$local_root"; then
    export FLUTTER_ROOT="$local_root"
    export PATH="${FLUTTER_ROOT}/bin:${PATH}"
    unset DART_ROOT
    return 0
  fi

  if command -v flutter >/dev/null 2>&1; then
    local flutter_bin fl_bin_root gradle_dir
    flutter_bin="$(command -v flutter)"
    if command -v realpath >/dev/null 2>&1; then
      flutter_bin="$(realpath "$flutter_bin")"
    elif fl_resolved="$(readlink -f "$flutter_bin" 2>/dev/null)" && [[ -n "$fl_resolved" ]]; then
      flutter_bin="$fl_resolved"
    fi
    fl_bin_root="$(cd "$(dirname "$flutter_bin")/.." && pwd)"
    gradle_dir="$fl_bin_root/packages/flutter_tools/gradle"

    if cloudity_flutter_sdk_healthcheck "$fl_bin_root" \
      && [[ -d "$gradle_dir" && -w "$gradle_dir" ]]; then
      export FLUTTER_ROOT="$fl_bin_root"
      export PATH="${FLUTTER_ROOT}/bin:${PATH}"
      unset DART_ROOT
      return 0
    fi
  fi

  cloudity_ensure_local_flutter_sdk
  return 0
}
