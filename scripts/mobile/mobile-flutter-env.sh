#!/usr/bin/env bash
# shellcheck shell=bash
#
# Prépare un environnement Flutter exécutable sans droits root.
# - Si FLUTTER_ROOT pointe déjà vers un SDK valide, on l'utilise.
# - Sinon, si le SDK courant est writable, on le garde.
# - Sinon, fallback auto vers un SDK local dans $HOME.
#
# Usage:
#   source scripts/mobile-flutter-env.sh
#   cloudity_prepare_flutter_env

set -euo pipefail

cloudity_prepare_flutter_env() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

  if [[ -n "${FLUTTER_ROOT:-}" ]] && [[ -x "${FLUTTER_ROOT}/bin/flutter" ]]; then
    export PATH="${FLUTTER_ROOT}/bin:${PATH}"
    return 0
  fi

  if ! command -v flutter >/dev/null 2>&1; then
    return 1
  fi

  local flutter_bin fl_bin_root gradle_dir
  flutter_bin="$(command -v flutter)"
  if command -v realpath >/dev/null 2>&1; then
    flutter_bin="$(realpath "$flutter_bin")"
  elif fl_resolved="$(readlink -f "$flutter_bin" 2>/dev/null)" && [[ -n "$fl_resolved" ]]; then
    flutter_bin="$fl_resolved"
  fi
  fl_bin_root="$(cd "$(dirname "$flutter_bin")/.." && pwd)"
  gradle_dir="$fl_bin_root/packages/flutter_tools/gradle"

  # SDK système writable -> garder.
  if [[ -d "$gradle_dir" && -w "$gradle_dir" ]]; then
    FLUTTER_ROOT="$fl_bin_root"
    export FLUTTER_ROOT
    return 0
  fi

  # SDK readonly -> bascule sur un SDK local.
  local local_root="${CLOUDITY_LOCAL_FLUTTER_ROOT:-$HOME/.cache/cloudity/flutter-sdk}"
  local local_bin="$local_root/bin/flutter"
  if [[ ! -x "$local_bin" ]]; then
    echo "📦 SDK Flutter système readonly détecté, installation locale dans: $local_root"
    mkdir -p "$(dirname "$local_root")"
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$local_root"
    else
      echo "❌ git requis pour installer un SDK Flutter local."
      return 1
    fi
  fi

  FLUTTER_ROOT="$local_root"
  export FLUTTER_ROOT
  export PATH="${FLUTTER_ROOT}/bin:${PATH}"

  # Préchauffage léger (tolérant).
  "$local_bin" --version >/dev/null 2>&1 || true
  return 0
}

