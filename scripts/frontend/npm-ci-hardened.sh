#!/usr/bin/env bash
# npm ci durci (FE-SEC-SUPPLY-02) : npm 12 allowScripts + rebuild esbuild.
# Usage : depuis la racine repo → ./scripts/frontend/npm-ci-hardened.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="${ROOT}/frontend"
cd "$FRONTEND"

# Allowlist scripts post-install (binaires nécessaires au build Vite).
# cbor-extract : hors allowlist (fallback JS de cbor-x).
echo "📦 npm ci — frontend/…"
npm ci --no-audit --no-fund

echo "🔧 allowScripts + rebuild : esbuild"
npm install-scripts approve esbuild >/dev/null 2>&1 || true
npm rebuild esbuild

echo "✅ frontend npm-ci-hardened OK"
