#!/usr/bin/env bash
# Wrapper générique : compose run + capture logs (make test-go-one, test-auth, futurs tests).
# Usage :
#   ./scripts/ci/run-compose-test.sh <phase> <service> -- <commande...>
# Exemple :
#   ./scripts/ci/run-compose-test.sh unit/auth-service auth-service -- go test -v -count=1 ./...

set -euo pipefail

if [ $# -lt 4 ] || [ "$3" != "--" ]; then
  echo "Usage: $0 <phase> <service> -- <command...>"
  echo "Exemple: $0 unit/auth-service auth-service -- go test -v -count=1 ./..."
  exit 1
fi

PHASE="$1"
SERVICE="$2"
shift 3

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLOUDITY_REPO_ROOT="$ROOT"

# shellcheck source=scripts/ci/test-log-capture.inc.sh
source "$ROOT/scripts/ci/test-log-capture.inc.sh"

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker doit être disponible."
  exit 1
fi

[ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "${CLOUDITY_TEST_RUN_LABEL:-compose-test}"
DOCKER_IT=""
if [ -t 1 ]; then
  DOCKER_IT="-it"
fi
export DOCKER_IT

echo "🧪 ${SERVICE} (Docker) — phase ${PHASE}"
cloudity_test_logs_summary_line

if cloudity_test_compose_run "$PHASE" "$SERVICE" "$@"; then
  cloudity_test_write_summary 0
  echo "✅ ${SERVICE} OK"
  cloudity_test_logs_summary_line
  exit 0
fi

cloudity_test_write_summary 1
echo "❌ ${SERVICE} ÉCHEC — logs : ${CLOUDITY_TEST_LOGS_DIR}/${PHASE}/"
exit 1
