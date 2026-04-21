#!/usr/bin/env bash
# Tests Flutter Cloudity Mail uniquement. Voir scripts/test-mobile-app.sh mail.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "${ROOT}/scripts/test-mobile-app.sh" 2>/dev/null || true
exec "${ROOT}/scripts/test-mobile-app.sh" mail "$@"
