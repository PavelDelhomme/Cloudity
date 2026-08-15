#!/usr/bin/env bash
# npm ci durci (FE-SEC-SUPPLY-02) : npm 12 allowScripts + rebuild esbuild.
# Usage : depuis la racine repo → ./scripts/frontend/npm-ci-hardened.sh
#
# Ne pas utiliser `npm install-scripts approve esbuild` : ça re-pinne en
# esbuild@x.y.z, souvent ignoré → binaire manquant → make up cassé.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="${ROOT}/frontend"
cd "$FRONTEND"

force_esbuild_allow() {
  python3 - <<'PY'
import json
from pathlib import Path
path = Path("package.json")
data = json.loads(path.read_text(encoding="utf-8"))
allow = data.get("allowScripts") or {}
for k in list(allow.keys()):
    if k == "esbuild" or k.startswith("esbuild@"):
        del allow[k]
allow["esbuild"] = True
data["allowScripts"] = allow
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
}

force_esbuild_allow

echo "📦 npm ci — frontend/…"
npm ci --no-audit --no-fund

force_esbuild_allow
echo "🔧 rebuild esbuild"
npm rebuild esbuild

if [ ! -x node_modules/esbuild/bin/esbuild ] && [ ! -x node_modules/esbuild/esbuild ]; then
  echo "❌ esbuild binaire manquant après rebuild"
  exit 1
fi

echo "✅ frontend npm-ci-hardened OK"
