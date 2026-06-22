#!/usr/bin/env bash
# Bibliothèque Cloudity — capture sécurisée des logs conteneurs pendant les tests.
# Source depuis les scripts CI :  source "$(dirname "$0")/test-log-capture.inc.sh"
#
# Variables d'environnement :
#   CLOUDITY_TEST_RUN_ID      — identifiant de run (partagé entre phases make tests)
#   CLOUDITY_TEST_LOGS_DIR    — répertoire de sortie (reports/test-logs/<run-id>/)
#   CLOUDITY_TEST_LOGS_ALWAYS — 1 (défaut) : capture après chaque phase ; 0 : échec seulement
#   CLOUDITY_TEST_LOG_SINCE   — fenêtre docker logs (défaut 10m)
#   CLOUDITY_TEST_LOG_TAIL    — lignes max par service (défaut 3000)
#   CLOUDITY_TEST_LOG_REDACT  — 1 (défaut) : masque JWT, mots de passe, secrets TOTP

cloudity__compose_init() {
  if [ -n "${CLOUDITY_COMPOSE_INIT:-}" ]; then
    return 0
  fi
  if docker compose version >/dev/null 2>&1; then
    CLOUDITY_COMPOSE="docker compose"
  else
    CLOUDITY_COMPOSE="docker-compose"
  fi
  CLOUDITY_COMPOSE_FILES="${CLOUDITY_COMPOSE_FILES:--f docker-compose.yml}"
  CLOUDITY_COMPOSE_INIT=1
  export CLOUDITY_COMPOSE CLOUDITY_COMPOSE_FILES CLOUDITY_COMPOSE_INIT
}

cloudity_compose() {
  cloudity__compose_init
  # shellcheck disable=SC2086
  $CLOUDITY_COMPOSE $CLOUDITY_COMPOSE_FILES "$@"
}

# Services stack utiles pour corrélation E2E / mobile / sécurité.
CLOUDITY_STACK_SERVICES=(
  api-gateway
  auth-service
  admin-service
  passwords-service
  mail-directory-service
  calendar-service
  contacts-service
  notes-service
  tasks-service
  photos-service
  drive-service
  cloudity-web
  postgres
  redis
  db-migrate
)

cloudity_test_logs_root() {
  local root="${CLOUDITY_REPO_ROOT:-}"
  if [ -z "$root" ]; then
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi
  printf '%s/reports/test-logs' "$root"
}

# Initialise reports/test-logs/<run-id>/ + manifest.jsonl
cloudity_test_logs_init() {
  local label="${1:-test-run}"
  cloudity__compose_init

  if [ -z "${CLOUDITY_TEST_RUN_ID:-}" ]; then
    CLOUDITY_TEST_RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
  fi
  export CLOUDITY_TEST_RUN_ID

  CLOUDITY_TEST_LOGS_DIR="$(cloudity_test_logs_root)/${CLOUDITY_TEST_RUN_ID}"
  export CLOUDITY_TEST_LOGS_DIR
  mkdir -p "$CLOUDITY_TEST_LOGS_DIR"
  chmod 700 "$CLOUDITY_TEST_LOGS_DIR" 2>/dev/null || true

  if [ ! -f "$CLOUDITY_TEST_LOGS_DIR/manifest.jsonl" ]; then
    {
      echo "{\"event\":\"run_start\",\"run_id\":\"$CLOUDITY_TEST_RUN_ID\",\"label\":\"$label\",\"started_at\":\"$(date -Iseconds)\"}"
    } >> "$CLOUDITY_TEST_LOGS_DIR/manifest.jsonl"
  fi
}

cloudity_test_log_redact_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  [ "${CLOUDITY_TEST_LOG_REDACT:-1}" = "1" ] || return 0

  local tmp
  tmp="$(mktemp)"
  sed -E \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+/=-]{12,}/\1[REDACTED]/g' \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[A-Za-z0-9._~+/=-]+/\1[REDACTED]/gi' \
    -e 's/("access_token"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/("refresh_token"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/("password"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/("password_hash"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/("totp_secret"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/(password=)[^[:space:]&"]+/\1[REDACTED]/gi' \
    -e 's/(secret=)[A-Z2-7]{8,}/secret=[REDACTED]/gi' \
    -e 's|(otpauth://[^"[:space:]]*secret=)[A-Z2-7]+|\1[REDACTED]|gi' \
    -e 's/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/[JWT_REDACTED]/g' \
    "$f" > "$tmp"
  mv "$tmp" "$f"
  chmod 600 "$f" 2>/dev/null || true
}

cloudity_test_manifest_event() {
  local json="$1"
  [ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || return 0
  echo "$json" >> "$CLOUDITY_TEST_LOGS_DIR/manifest.jsonl"
}

# Capture logs compose (service up) + conteneurs éphémères *-run-* récents.
cloudity_test_capture_service_logs() {
  local phase="$1"
  shift
  local services=("$@")
  [ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "$phase"

  local out_dir="${CLOUDITY_TEST_LOGS_DIR}/${phase}"
  mkdir -p "$out_dir"
  local since="${CLOUDITY_TEST_LOG_SINCE:-10m}"
  local tail_n="${CLOUDITY_TEST_LOG_TAIL:-3000}"
  local captured_files=()

  for svc in "${services[@]}"; do
    local out="${out_dir}/${svc}.log"
    {
      echo "=== Cloudity test log capture ==="
      echo "run_id: ${CLOUDITY_TEST_RUN_ID}"
      echo "phase: ${phase}"
      echo "service: ${svc}"
      echo "captured_at: $(date -Iseconds)"
      echo "since: ${since}"
      echo ""
      echo "=== docker compose logs (service ${svc}) ==="
    } > "$out"

    cloudity_compose logs --no-color --since "$since" --tail="$tail_n" "$svc" >> "$out" 2>&1 || true

    {
      echo ""
      echo "=== conteneurs éphémères (${svc}-run-*) ==="
    } >> "$out"

    local cid
    while IFS= read -r cid; do
      [ -n "$cid" ] || continue
      {
        echo ""
        echo "--- docker logs ${cid} ---"
        docker logs --tail "$tail_n" "$cid" 2>&1 || true
      } >> "$out"
    done < <(docker ps -a --filter "name=cloudity-${svc}-run" --format '{{.ID}}' 2>/dev/null | head -8)

    cloudity_test_log_redact_file "$out"
    captured_files+=("${svc}.log")
  done

  local files_json
  files_json="$(printf '"%s",' "${captured_files[@]}" | sed 's/,$//')"
  cloudity_test_manifest_event "{\"event\":\"capture\",\"phase\":\"${phase}\",\"services\":\"$(printf '%s,' "${services[@]}" | sed 's/,$//')\",\"files\":[${files_json}],\"at\":\"$(date -Iseconds)\"}"
}

cloudity_test_should_capture() {
  local exit_code="$1"
  if [ "${CLOUDITY_TEST_LOGS_ALWAYS:-1}" = "1" ]; then
    return 0
  fi
  [ "$exit_code" -ne 0 ]
}

# Exécute une commande, enregistre stdout/stderr + logs conteneurs associés.
cloudity_test_run_with_logs() {
  local phase="$1"
  local services_csv="$2"
  shift 2

  [ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "$phase"

  local out_dir="${CLOUDITY_TEST_LOGS_DIR}/${phase}"
  mkdir -p "$out_dir"
  local cmd_log="${out_dir}/command-output.log"
  local exit_code=0
  local start_at
  start_at="$(date -Iseconds)"

  set +e
  "$@" 2>&1 | tee "$cmd_log"
  exit_code=${PIPESTATUS[0]}
  set -e

  cloudity_test_log_redact_file "$cmd_log"

  IFS=',' read -ra services <<< "$services_csv"
  if cloudity_test_should_capture "$exit_code"; then
    cloudity_test_capture_service_logs "$phase" "${services[@]}"
  fi

  cloudity_test_manifest_event "{\"event\":\"phase_end\",\"phase\":\"${phase}\",\"exit_code\":${exit_code},\"started_at\":\"${start_at}\",\"ended_at\":\"$(date -Iseconds)\",\"command_log\":\"command-output.log\"}"

  return "$exit_code"
}

# compose run --no-deps avec capture stdout + logs service.
cloudity_test_compose_run() {
  local phase="$1"
  local service="$2"
  shift 2
  local docker_it="${DOCKER_IT:-}"

  [ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] || cloudity_test_logs_init "$phase"

  local out_dir="${CLOUDITY_TEST_LOGS_DIR}/${phase}"
  mkdir -p "$out_dir"
  local test_log="${out_dir}/${service}-test-output.log"
  local exit_code=0
  local start_at
  start_at="$(date -Iseconds)"

  echo "  [${service}]"

  set +e
  # shellcheck disable=SC2086
  cloudity_compose run --rm $docker_it --no-deps "$service" "$@" 2>&1 | tee "$test_log"
  exit_code=${PIPESTATUS[0]}
  set -e

  cloudity_test_log_redact_file "$test_log"

  if cloudity_test_should_capture "$exit_code"; then
    cloudity_test_capture_service_logs "$phase" "$service"
  fi

  cloudity_test_manifest_event "{\"event\":\"compose_run\",\"phase\":\"${phase}\",\"service\":\"${service}\",\"exit_code\":${exit_code},\"started_at\":\"${start_at}\",\"ended_at\":\"$(date -Iseconds)\",\"test_output\":\"${service}-test-output.log\"}"

  return "$exit_code"
}

# Capture transverse stack (E2E, Playwright, mobile avec backend).
cloudity_test_capture_stack_logs() {
  local phase="$1"
  cloudity_test_capture_service_logs "$phase" "${CLOUDITY_STACK_SERVICES[@]}"
}

cloudity_test_stack_services_csv() {
  local IFS=,
  echo "${CLOUDITY_STACK_SERVICES[*]}"
}

cloudity_test_logs_summary_line() {
  if [ -n "${CLOUDITY_TEST_LOGS_DIR:-}" ] && [ -d "$CLOUDITY_TEST_LOGS_DIR" ]; then
    echo "  Logs conteneurs : ${CLOUDITY_TEST_LOGS_DIR}"
  fi
}
