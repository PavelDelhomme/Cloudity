#!/usr/bin/env bash
# Suite mobile Cloudity : Photos → Drive → Mail (ADB / SDK / E2E auto par app).
# CLOUDITY_SKIP_MOBILE_DRIVE=1 — après Photos, pas de Drive.
# CLOUDITY_SKIP_MOBILE_MAIL=1 — pas de Mail (après Drive si exécuté).
# Appelé par make tests (run-tests-with-report.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLOUDITY_REPO_ROOT="$ROOT"

# shellcheck source=scripts/ci/test-log-capture.inc.sh
source "$ROOT/scripts/ci/test-log-capture.inc.sh"
[ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "mobile-suite"

chmod +x "${ROOT}/scripts/mobile/test-mobile-app.sh" 2>/dev/null || true

mobile_failed=0

if ! "${ROOT}/scripts/mobile/test-mobile-app.sh" photos; then
  mobile_failed=1
fi

if [[ "${CLOUDITY_SKIP_MOBILE_DRIVE:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_MOBILE_DRIVE=1 — tests mobile Drive ignorés."
else
  if ! "${ROOT}/scripts/mobile/test-mobile-app.sh" drive; then
    mobile_failed=1
  fi
fi

if [[ "${CLOUDITY_SKIP_MOBILE_MAIL:-}" == "1" ]]; then
  echo "ℹ️  CLOUDITY_SKIP_MOBILE_MAIL=1 — tests mobile Mail ignorés."
else
  if ! "${ROOT}/scripts/mobile/test-mobile-app.sh" mail; then
    mobile_failed=1
  fi
fi

if cloudity_test_should_capture "$mobile_failed"; then
  cloudity_test_capture_stack_logs "phase5-mobile" || true
fi

cloudity_test_manifest_event "{\"event\":\"mobile_suite_done\",\"exit_code\":${mobile_failed},\"at\":\"$(date -Iseconds)\"}"

if [ "$mobile_failed" -ne 0 ]; then
  echo "❌ Suite mobile en échec — logs stack : ${CLOUDITY_TEST_LOGS_DIR}/phase5-mobile/"
  exit 1
fi

echo "✅ Suite mobile terminée : Photos + Drive + Mail (tests hôte ; integration_test device si SDK inscriptible + ADB)."
cloudity_test_logs_summary_line
