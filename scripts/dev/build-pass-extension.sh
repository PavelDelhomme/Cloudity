#!/usr/bin/env bash
# Build extension Cloudity Pass (MV3) — robuste pour make up / up-full.
#
# npm 12 bloque les postinstall (esbuild) sauf allowScripts.
# Important : `npm install-scripts approve esbuild` re-pinne en `esbuild@x.y.z`,
# ce qui est souvent IGNORÉ si le lockfile n’a pas de resolved stable.
# On force donc allowScripts "esbuild": true (par nom) + rebuild binaire.
#
# Usage :
#   ./scripts/dev/build-pass-extension.sh
#   CLOUDITY_PASS_EXTENSION_SOFT=1 ./scripts/dev/build-pass-extension.sh
#     → en cas d’échec : warning + exit 0 (la stack Docker peut démarrer)
#
# CLOUDITY_REQUIRE_PASS_EXTENSION=1 force l’échec même en mode soft.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SOFT="${CLOUDITY_PASS_EXTENSION_SOFT:-0}"
if [ "${CLOUDITY_REQUIRE_PASS_EXTENSION:-0}" = "1" ]; then
  SOFT=0
fi

fail_or_soft() {
  local msg="$1"
  echo "❌ $msg"
  if [ "$SOFT" = "1" ]; then
    echo "⚠️  Extension Pass ignorée (CLOUDITY_PASS_EXTENSION_SOFT=1) — la stack démarre quand même."
    echo "   Plus tard : make build-pass-extension"
    exit 0
  fi
  exit 1
}

echo "🔌 Build extension Cloudity Pass (MV3)…"

if ! command -v npm >/dev/null 2>&1; then
  fail_or_soft "npm requis (install Node.js) pour build-pass-extension."
fi

# Force allowScripts par nom (ne pas utiliser npm install-scripts approve — ça re-pinne).
ensure_esbuild_allowscripts() {
  local pkg_json="$1/package.json"
  [ -f "$pkg_json" ] || return 0
  python3 - "$pkg_json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
allow = data.get("allowScripts") or {}
# Retirer les pins esbuild@… et garder uniquement le nom.
for k in list(allow.keys()):
    if k == "esbuild" or k.startswith("esbuild@"):
        del allow[k]
allow["esbuild"] = True
data["allowScripts"] = allow
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
}

ensure_esbuild_bin() {
  local dir="$1"
  (
    cd "$dir"
    ensure_esbuild_allowscripts .
    if [ -x node_modules/esbuild/bin/esbuild ] || [ -x node_modules/esbuild/esbuild ]; then
      return 0
    fi
    npm rebuild esbuild >/dev/null 2>&1 || true
    if [ -x node_modules/esbuild/bin/esbuild ] || [ -x node_modules/esbuild/esbuild ]; then
      return 0
    fi
    # Dernier recours : réinstalle esbuild en laissant les scripts (allowScripts déjà OK).
    npm install esbuild --no-audit --fund=false >/dev/null 2>&1 || true
    if [ -x node_modules/esbuild/bin/esbuild ] || [ -x node_modules/esbuild/esbuild ]; then
      return 0
    fi
    return 1
  )
}

# Deps monorepo pour file: pass-crypto / shared / ui
if [ ! -d frontend/node_modules/@noble/hashes ] \
  || [ ! -d frontend/node_modules/hash-wasm ] \
  || [ ! -d frontend/node_modules/@cloudity/ui ]; then
  echo "📦 frontend/node_modules incomplet — npm ci (hardened)…"
  if [ -x scripts/frontend/npm-ci-hardened.sh ]; then
    ./scripts/frontend/npm-ci-hardened.sh || fail_or_soft "frontend npm ci échoué."
  else
    ensure_esbuild_allowscripts frontend
    (cd frontend && npm ci --no-audit --fund=false) || fail_or_soft "frontend npm ci échoué."
    ensure_esbuild_bin frontend || true
  fi
fi

ensure_esbuild_allowscripts frontend
ensure_esbuild_bin frontend || true

cd extensions/cloudity-pass
ensure_esbuild_allowscripts .

npm install --no-audit --fund=false || fail_or_soft "npm install (extension Pass) échoué."

# npm install peut avoir re-écrit allowScripts via un outil — re-force + binaire
ensure_esbuild_allowscripts .
ensure_esbuild_bin . || fail_or_soft "esbuild introuvable après rebuild (extension Pass)."

npm run build || fail_or_soft "npm run build (extension Pass) échoué."

echo "✅ Extension : extensions/cloudity-pass/dist (Chrome → Mode développeur → Charger l’extension non empaquetée)"
