#!/usr/bin/env bash
# Vérifie que le SDK Flutter peut être écrit par Gradle (Kotlin) pour les builds Android.
# Sur Arch / pacman, /usr/lib/flutter est souvent root:root → erreur :
#   NoSuchFileException: .../flutter_tools/gradle/.kotlin/sessions/*.salive
#
# CLOUDITY_SKIP_FLUTTER_SDK_CHECK=1 — court-circuite la vérif (risque d’échec build).
# CLOUDITY_QUIET_FLUTTER_SDK_CHECK=1 — échec sans message stderr (l’appelant explique le contexte).
# CLOUDITY_ALLOW_READONLY_FLUTTER_SDK=1 — autorise SDK readonly si Kotlin est redirigé hors SDK.
set -euo pipefail

_cloudity_flutter_sdk_error() {
  local FL_ROOT="$1"
  local GDIR="$2"
  echo "❌ Le SDK Flutter n’est pas inscriptible pour les builds Android :" >&2
  echo "   $GDIR" >&2
  echo "" >&2
  echo "   Gradle compile du Kotlin dans ce répertoire ; sans droits d’écriture," >&2
  echo "   vous obtiendrez : NoSuchFileException … .kotlin/sessions/*.salive" >&2
  echo "" >&2
  echo "   Correctifs possibles (choisir un) :" >&2
  echo "   1) Donner la propriété du SDK à votre utilisateur (installation pacman/AUR) :" >&2
  echo "        sudo chown -R \"\$(whoami)\" \"$FL_ROOT\"" >&2
  echo "      (à refaire après une mise à jour majeure du paquet flutter)" >&2
  echo "   2) Installer Flutter dans votre \$HOME (git clone officiel) et mettre ce bin" >&2
  echo "      avant /usr/bin dans le PATH." >&2
  echo "   3) Ou, sans toucher au PATH global, pour une session uniquement :" >&2
  echo "        export FLUTTER_ROOT=\"\$HOME/flutter\"   # chemin où est installé le SDK" >&2
  echo "        export PATH=\"\$FLUTTER_ROOT/bin:\$PATH\"" >&2
  echo "        make run-mobile APP=Mail              # run-mobile honore FLUTTER_ROOT" >&2
  echo "" >&2
}

if [[ "${CLOUDITY_SKIP_FLUTTER_SDK_CHECK:-}" == "1" ]]; then
  exit 0
fi

# Si 1 : échec sans message (l’appelant affiche le contexte, ex. test-mobile-photos avant skip device).
QUIET="${CLOUDITY_QUIET_FLUTTER_SDK_CHECK:-0}"

if ! command -v flutter >/dev/null 2>&1; then
  exit 0
fi

FL_BIN="$(command -v flutter)"
if command -v realpath >/dev/null 2>&1; then
  FL_BIN="$(realpath "$FL_BIN")"
elif FL_RESOLVED="$(readlink -f "$FL_BIN" 2>/dev/null)" && [[ -n "$FL_RESOLVED" ]]; then
  FL_BIN="$FL_RESOLVED"
fi

FL_ROOT="$(cd "$(dirname "$FL_BIN")/.." && pwd)"
GDIR="$FL_ROOT/packages/flutter_tools/gradle"

if [[ ! -d "$GDIR" ]]; then
  exit 0
fi

if [[ ! -w "$GDIR" ]]; then
  if [[ "${CLOUDITY_ALLOW_READONLY_FLUTTER_SDK:-0}" == "1" ]]; then
    if [[ -n "${KOTLIN_USER_HOME:-}" ]] || [[ "${GRADLE_OPTS:-}" == *"kotlin.project.persistent.dir="* ]]; then
      exit 0
    fi
  fi
  [[ "$QUIET" != "1" ]] && _cloudity_flutter_sdk_error "$FL_ROOT" "$GDIR"
  exit 1
fi

if [[ -e "$GDIR/.kotlin" ]] && [[ ! -w "$GDIR/.kotlin" ]]; then
  if [[ "${CLOUDITY_ALLOW_READONLY_FLUTTER_SDK:-0}" == "1" ]]; then
    if [[ -n "${KOTLIN_USER_HOME:-}" ]] || [[ "${GRADLE_OPTS:-}" == *"kotlin.project.persistent.dir="* ]]; then
      exit 0
    fi
  fi
  [[ "$QUIET" != "1" ]] && _cloudity_flutter_sdk_error "$FL_ROOT" "$GDIR"
  exit 1
fi

exit 0
