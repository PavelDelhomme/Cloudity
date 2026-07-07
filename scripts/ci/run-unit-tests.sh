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

CLOUDITY_WEB_TEST_TIMEOUT="${CLOUDITY_WEB_TEST_TIMEOUT:-25m}"
# Pas de -it : Ctrl+C fiable avec tee/pipe, pas de blocage TTY.
DOCKER_IT=""
export DOCKER_IT

# Nettoyage des compose run si interruption pendant la suite de tests.
_cloudity_test_interrupt() {
  echo ""
  echo "⚠️  Tests interrompus — arrêt des conteneurs *-run-*…"
  # shellcheck source=scripts/dev/prune-compose-runs.sh
  if [ -f "$ROOT/scripts/dev/prune-compose-runs.sh" ]; then
    chmod +x "$ROOT/scripts/dev/prune-compose-runs.sh" 2>/dev/null || true
    "$ROOT/scripts/dev/prune-compose-runs.sh" || true
  fi
  exit 130
}
trap _cloudity_test_interrupt INT TERM

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
  admin_out="${CLOUDITY_TEST_LOGS_DIR}/${admin_phase}"
  mkdir -p "$admin_out"
  admin_log="${admin_out}/admin-service-test-output.log"
  set +e
  # Sans --no-deps : pytest admin a besoin du hostname « postgres » sur le réseau compose.
  # shellcheck disable=SC2086
  cloudity_compose run --rm $DOCKER_IT admin-service python -m pytest tests/ -v --tb=short 2>&1 | tee "$admin_log"
  admin_exit=${PIPESTATUS[0]}
  set -e
  cloudity_test_log_redact_file "$admin_log"
  if cloudity_test_should_capture "$admin_exit"; then
    cloudity_test_capture_service_logs "$admin_phase" postgres redis db-migrate admin-service 2>/dev/null || true
  fi
  if [ "$admin_exit" -ne 0 ]; then
    failed=1
  fi
fi

echo "  [cloudity-web]"
_web_test_cmd='cd /ws && npm install && cd apps/cloudity-web && FORCE_COLOR=1 npx vitest run --testTimeout=15000'
if command -v timeout >/dev/null 2>&1; then
  if ! timeout --foreground "${CLOUDITY_WEB_TEST_TIMEOUT}" \
    cloudity_test_compose_run "phase1-unit/cloudity-web" cloudity-web sh -c "$_web_test_cmd"; then
    failed=1
  fi
else
  if ! cloudity_test_compose_run "phase1-unit/cloudity-web" cloudity-web sh -c "$_web_test_cmd"; then
    failed=1
  fi
fi

trap - INT TERM

chmod +x scripts/dev/prune-compose-runs.sh 2>/dev/null || true
"$ROOT/scripts/dev/prune-compose-runs.sh" || true

cloudity_test_manifest_event "{\"event\":\"unit_tests_done\",\"exit_code\":${failed},\"at\":\"$(date -Iseconds)\"}"

chmod +x scripts/ci/generate-test-run-report.sh 2>/dev/null || true
CLOUDITY_TEST_RUN_ID="${CLOUDITY_TEST_RUN_ID:-$(basename "$CLOUDITY_TEST_LOGS_DIR")}" \
  ./scripts/ci/generate-test-run-report.sh || true

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "❌ Échec tests unitaires — logs conteneurs : ${CLOUDITY_TEST_LOGS_DIR}"
  chmod +x scripts/dev/up-failure-hint.sh 2>/dev/null || true
  if [ -f "$ROOT/scripts/dev/up-failure-hint.sh" ]; then
    "$ROOT/scripts/dev/up-failure-hint.sh" tests
  fi
  exit 1
fi

echo "✅ Tous les tests sont passés."
cloudity_test_logs_summary_line
exit 0
