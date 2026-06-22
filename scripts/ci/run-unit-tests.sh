#!/usr/bin/env bash
# Tests unitaires / applicatifs dans Docker avec capture logs conteneurs.
# Usage : ./scripts/ci/run-unit-tests.sh   ou   make test

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLOUDITY_REPO_ROOT="$ROOT"

# shellcheck source=scripts/ci/test-log-capture.inc.sh
source "$ROOT/scripts/ci/test-log-capture.inc.sh"

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker doit être disponible (démarrer le démon Docker)."
  exit 1
fi

[ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "${CLOUDITY_TEST_RUN_LABEL:-make-test}"
export CLOUDITY_TEST_LOGS_DIR CLOUDITY_TEST_RUN_ID
echo "🧪 Tests unitaires / applicatifs (conteneurs Docker, même toolchain que la stack)..."
cloudity_test_logs_summary_line

DOCKER_IT=""
if [ -t 1 ]; then
  DOCKER_IT="-it"
fi
export DOCKER_IT

failed=0

run_go_service() {
  local svc="$1"
  if ! cloudity_test_compose_run "phase1-unit/${svc}" "$svc" go test -v -count=1 ./...; then
    failed=1
  fi
}

run_go_service auth-service
run_go_service api-gateway
run_go_service passwords-service
run_go_service mail-directory-service
run_go_service calendar-service
run_go_service contacts-service
run_go_service notes-service
run_go_service tasks-service
run_go_service photos-service
run_go_service drive-service

echo "  [admin-service]"
admin_phase="phase1-unit/admin-service"
if cloudity_compose ps -q admin-service 2>/dev/null | grep -q .; then
  echo "    → exec dans admin-service (stack déjà up, évite un 2e Postgres sur le port hôte)"
  if ! cloudity_test_run_with_logs "$admin_phase" "admin-service,postgres,redis" \
    cloudity_compose exec -T admin-service python -m pytest tests/ -v --tb=short; then
    failed=1
  fi
else
  echo "    → compose run (démarre Postgres / Redis / migrate pour pytest)"
  if ! cloudity_test_compose_run "$admin_phase" admin-service python -m pytest tests/ -v --tb=short; then
    failed=1
  fi
  cloudity_test_capture_service_logs "$admin_phase" postgres redis db-migrate 2>/dev/null || true
fi

echo "  [cloudity-web]"
if ! cloudity_test_compose_run "phase1-unit/cloudity-web" cloudity-web \
  sh -c "cd /ws && npm install && cd apps/cloudity-web && FORCE_COLOR=1 npm run test"; then
  failed=1
fi

cloudity_test_manifest_event "{\"event\":\"unit_tests_done\",\"exit_code\":${failed},\"at\":\"$(date -Iseconds)\"}"

chmod +x scripts/ci/generate-test-run-report.sh 2>/dev/null || true
CLOUDITY_TEST_RUN_ID="${CLOUDITY_TEST_RUN_ID:-$(basename "$CLOUDITY_TEST_LOGS_DIR")}" \
  ./scripts/ci/generate-test-run-report.sh || true

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "❌ Échec tests unitaires — logs conteneurs : ${CLOUDITY_TEST_LOGS_DIR}"
  exit 1
fi

echo "✅ Tous les tests sont passés."
cloudity_test_logs_summary_line
exit 0
