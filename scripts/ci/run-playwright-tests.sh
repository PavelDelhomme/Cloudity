#!/usr/bin/env bash
# E2E Playwright avec capture logs stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLOUDITY_REPO_ROOT="$ROOT"

# shellcheck source=scripts/ci/test-log-capture.inc.sh
source "$ROOT/scripts/ci/test-log-capture.inc.sh"

PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"
PORT_GATEWAY="${PORT_GATEWAY:-6002}"

chmod +x "${ROOT}/scripts/dev/env-get.sh" 2>/dev/null || true
# shellcheck source=scripts/dev/env-get.sh
source "${ROOT}/scripts/dev/env-get.sh"
export PLAYWRIGHT_E2E_EMAIL="${PLAYWRIGHT_E2E_EMAIL:-$(cloudity_env_get SEED_ADMIN_EMAIL admin@cloudity.local)}"
export PLAYWRIGHT_E2E_PASSWORD="${PLAYWRIGHT_E2E_PASSWORD:-$(cloudity_env_get SEED_ADMIN_PASSWORD)}"

[ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "playwright"

if [ -x "${ROOT}/frontend/node_modules/.bin/playwright" ]; then
  "${ROOT}/frontend/node_modules/.bin/playwright" install chromium >/dev/null 2>&1 || true
fi

echo "🎭 Tests E2E Playwright (login, Hub, Drive, Office, Mail, Pass, Calendrier)..."
if curl -sf "http://localhost:${PORT_GATEWAY}/health" >/dev/null 2>&1; then
  make seed-admin >/dev/null 2>&1 || true
fi
cloudity_test_logs_summary_line

phase="phase3-playwright"
exit_code=0

if ! cloudity_test_run_with_logs "$phase" "$(cloudity_test_stack_services_csv)" \
  bash -c "cd frontend/apps/cloudity-web && BASE_URL=http://localhost:${PORT_DASHBOARD} PLAYWRIGHT_API_URL=http://localhost:${PORT_GATEWAY} FORCE_COLOR=0 NO_COLOR=1 npx playwright test"; then
  exit_code=1
fi

if [ "$exit_code" -ne 0 ]; then
  echo "❌ E2E Playwright ÉCHEC — logs stack : ${CLOUDITY_TEST_LOGS_DIR}/${phase}/"
  exit 1
fi

echo "✅ E2E Playwright OK"
cloudity_test_logs_summary_line
exit 0
