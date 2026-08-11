#!/usr/bin/env bash
# Génère un SBOM CycloneDX du monorepo frontend (FE-SEC-SUPPLY-03).
# Usage : ./scripts/frontend/sbom-cyclonedx.sh
# Sortie : reports/sbom/frontend-cyclonedx.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="${ROOT}/frontend"
OUT_DIR="${ROOT}/reports/sbom"
OUT="${OUT_DIR}/frontend-cyclonedx.json"

mkdir -p "$OUT_DIR"
cd "$FRONTEND"

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx requis"
  exit 1
fi

echo "📦 SBOM CycloneDX — frontend/ → ${OUT}"
# @cyclonedx/cyclonedx-npm : génère depuis package-lock (pas d’install global)
npx --yes @cyclonedx/cyclonedx-npm@4.0.0 \
  --output-file "$OUT" \
  --output-format JSON \
  --package-lock-only \
  --omit dev \
  2>&1 | tail -20

if [[ ! -s "$OUT" ]]; then
  echo "❌ SBOM vide ou absent : $OUT"
  exit 1
fi

bytes="$(wc -c <"$OUT" | tr -d ' ')"
echo "✅ SBOM OK (${bytes} octets) — ${OUT}"
echo "   (reports/ est souvent gitignored ; attacher en CI comme artefact)"
