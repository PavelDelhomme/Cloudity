#!/usr/bin/env bash
# Suite mobile Cloudity : Photos → Drive → Mail (ADB / SDK / E2E auto par app).
# CLOUDITY_SKIP_MOBILE_DRIVE=1 — après Photos, pas de Drive.
# CLOUDITY_SKIP_MOBILE_MAIL=1 — pas de Mail (après Drive si exécuté).
# Appelé par make tests (run-tests-with-report.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "${ROOT}/scripts/test-mobile-app.sh" 2>/dev/null || true

"${ROOT}/scripts/test-mobile-app.sh" photos

if [[ "${CLOUDITY_SKIP_MOBILE_DRIVE:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_MOBILE_DRIVE=1 — tests mobile Drive ignorés."
else
  "${ROOT}/scripts/test-mobile-app.sh" drive
fi

if [[ "${CLOUDITY_SKIP_MOBILE_MAIL:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_MOBILE_MAIL=1 — tests mobile Mail ignorés."
  exit 0
fi

"${ROOT}/scripts/test-mobile-app.sh" mail

echo "✅ Suite mobile terminée : Photos + Drive + Mail (tests hôte ; integration_test device si SDK inscriptible + ADB)."
