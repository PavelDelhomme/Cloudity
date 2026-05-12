#!/usr/bin/env bash
# scripts/ci/check-versioning.sh — Cloudity Phase 0
#
# Pour chacune des 4 libs partagées, vérifie que si des fichiers source ont
# changé depuis BASE_REF, alors le fichier de version ET le CHANGELOG ont
# bougé aussi (cf. docs/architecture/VERSIONNAGE-LIBS.md § 6).
#
# Mode par défaut : warnings (exit 0 même en cas d'oubli) — utile en local.
# Mode bloquant : CHECK_VERSIONING_BLOCKING=1 → exit 1 si une lib oublie un bump.
#
# Variables :
#   BASE_REF                       branche de référence (def. origin/main puis main puis HEAD~1)
#   CHECK_VERSIONING_BLOCKING      "1" ⇒ fail le build sur oubli (CI)
#   CHECK_VERSIONING_VERBOSE       "1" ⇒ liste les fichiers modifiés par lib
#
# Exemples :
#   ./scripts/ci/check-versioning.sh                              # local (warnings)
#   BASE_REF=origin/main CHECK_VERSIONING_BLOCKING=1 ./scripts/ci/check-versioning.sh   # CI

set -u

BLOCKING="${CHECK_VERSIONING_BLOCKING:-0}"
VERBOSE="${CHECK_VERSIONING_VERBOSE:-0}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# --- Détection BASE_REF -------------------------------------------------

resolve_base_ref() {
  if [ -n "${BASE_REF:-}" ]; then
    if git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
      echo "$BASE_REF"
      return
    fi
  fi
  for cand in origin/main origin/master main master; do
    if git rev-parse --verify --quiet "$cand" >/dev/null; then
      echo "$cand"
      return
    fi
  done
  echo "HEAD~1"
}

BASE_REF_RESOLVED=$(resolve_base_ref)

if ! git rev-parse --verify --quiet "$BASE_REF_RESOLVED" >/dev/null; then
  echo "[check-versioning] BASE_REF=$BASE_REF_RESOLVED introuvable — skip."
  exit 0
fi

MERGE_BASE=$(git merge-base HEAD "$BASE_REF_RESOLVED" 2>/dev/null || echo "")
if [ -z "$MERGE_BASE" ]; then
  MERGE_BASE="$BASE_REF_RESOLVED"
fi

echo "[check-versioning] base=$BASE_REF_RESOLVED  merge-base=$MERGE_BASE"

# Union de :
#  - diff merge-base...HEAD        (commits sur la branche courante)
#  - diff index ↔ HEAD             (changements stagés non commités)
#  - diff working tree ↔ index     (changements non stagés)
# Triés/uniques pour faciliter les regex et l'affichage VERBOSE.
CHANGED=$(
  {
    git diff --name-only "$MERGE_BASE"...HEAD 2>/dev/null || true
    git diff --name-only --cached 2>/dev/null || true
    git diff --name-only 2>/dev/null || true
  } | sort -u
)
if [ -z "$CHANGED" ]; then
  echo "[check-versioning] aucun fichier modifié — rien à vérifier."
  exit 0
fi

# --- Helpers ------------------------------------------------------------

# changed_match <regex> → "1" si au moins un fichier matché, "" sinon
changed_match() {
  echo "$CHANGED" | grep -E "$1" >/dev/null 2>&1 && echo 1 || true
}

issues=0
warnings=0

check_lib() {
  local label="$1"        # ex. "internalsec"
  local src_pattern="$2"  # regex sur file path
  local version_path="$3" # fichier de version (ex. backend/internalsec/VERSION) ou ""
  local changelog_path="$4"

  local has_src has_version has_changelog
  has_src=$(changed_match "$src_pattern")
  has_version=""
  if [ -n "$version_path" ]; then
    has_version=$(changed_match "^${version_path}$")
  fi
  has_changelog=$(changed_match "^${changelog_path}$")

  if [ -z "$has_src" ]; then
    return
  fi

  if [ "$VERBOSE" = "1" ]; then
    echo "[check-versioning] $label — fichiers modifiés :"
    echo "$CHANGED" | grep -E "$src_pattern" | sed 's/^/    /'
  fi

  local missing=()
  if [ -n "$version_path" ] && [ -z "$has_version" ]; then
    missing+=("$version_path")
  fi
  if [ -z "$has_changelog" ]; then
    missing+=("$changelog_path")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo "❌ [$label] sources modifiées sans bump : ${missing[*]}"
    if [ "$BLOCKING" = "1" ]; then
      issues=$((issues + 1))
    else
      warnings=$((warnings + 1))
    fi
  else
    echo "✅ [$label] sources + version + CHANGELOG mis à jour"
  fi
}

# --- Libs surveillées ---------------------------------------------------

# 1) backend/internalsec : *.go (hors *_test.go optionnel ?), VERSION + CHANGELOG.md
check_lib "internalsec" \
  '^backend/internalsec/[^/]+\.go$' \
  "backend/internalsec/VERSION" \
  "backend/internalsec/CHANGELOG.md"

# 2) backend/pkg/dbpin : pas de fichier VERSION isolé (la version vit dans le tag Git futur).
#    On vérifie uniquement que CHANGELOG.md bouge.
check_lib "pkg/dbpin" \
  '^backend/pkg/dbpin/[^/]+\.go$' \
  "" \
  "backend/pkg/dbpin/CHANGELOG.md"

# 3) frontend/packages/cloudity-shared : src/** + package.json + CHANGELOG.md
check_lib "@cloudity/shared" \
  '^frontend/packages/cloudity-shared/src/' \
  "frontend/packages/cloudity-shared/package.json" \
  "frontend/packages/cloudity-shared/CHANGELOG.md"

# 4) mobile/cloudity_shared : lib/** + pubspec.yaml + CHANGELOG.md
check_lib "cloudity_shared (Dart)" \
  '^mobile/cloudity_shared/lib/' \
  "mobile/cloudity_shared/pubspec.yaml" \
  "mobile/cloudity_shared/CHANGELOG.md"

# --- Résumé -------------------------------------------------------------

echo ""
if [ "$issues" -gt 0 ]; then
  echo "[check-versioning] ❌ $issues erreur(s) bloquante(s) — CHECK_VERSIONING_BLOCKING=1"
  echo "  → bumper la version et/ou le CHANGELOG comme décrit dans"
  echo "    docs/architecture/VERSIONNAGE-LIBS.md § 5."
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  echo "[check-versioning] ⚠️  $warnings avertissement(s) — pas bloquant en local."
  echo "  → bumper avant le merge ; CHECK_VERSIONING_BLOCKING=1 fera fail la CI."
fi

if [ "$issues" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  echo "[check-versioning] ✅ aucune lib à bumper, ou bump déjà présent."
fi

exit 0
