#!/usr/bin/env bash
# Tests Flutter Cloudity Drive (hôte + integration_test ADB). Voir scripts/test-mobile-app.sh drive.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
chmod +x "${ROOT}/scripts/mobile/test-mobile-app.sh" 2>/dev/null || true
exec "${ROOT}/scripts/mobile/test-mobile-app.sh" drive "$@"
