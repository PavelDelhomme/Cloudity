#!/usr/bin/env bash
# Wrapper : tests uniquement Photos. Pour la suite complète : scripts/test-mobile-suite.sh (make tests).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "${ROOT}/scripts/test-mobile-app.sh" 2>/dev/null || true
exec "${ROOT}/scripts/test-mobile-app.sh" photos "$@"
