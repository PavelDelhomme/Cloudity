#!/usr/bin/env bash
# Suite de benchmarks ressources Cloudity (~20 scénarios).
# Mesure CPU/MEM/IO/latence conteneurs cloudity-* uniquement (pas l'hôte hors Docker).
# Rapport : reports/perf/benchmark-<run-id>/REPORT.md
#
# Prérequis recommandés : stack up (`make up`), jq, curl, docker.
# PERF_BENCHMARK_QUICK=1 — sous-ensemble rapide (~8 scénarios).
# PERF_BENCHMARK_SKIP_MOBILE=1 — ignore flutter test.
#
# Note chiffrement disque : vérifie uniquement les clés applicatives dans les
# conteneurs (MAIL_PASSWORD_ENCRYPTION_KEY, etc.) — ne touche JAMAIS au LUKS
# de la machine hôte (PCFixe) ni aux VPS de prod.

set -euo pipefail

export LC_ALL=C
export LANG=C

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
fi

PORT_GATEWAY="${PORT_GATEWAY:-6080}"
PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"
RUN_ID="$(date +%Y%m%dT%H%M%SZ)-$$"
OUT_DIR="reports/perf/benchmark-${RUN_ID}"
mkdir -p "$OUT_DIR"

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Manque : $1" >&2; exit 1; }; }
require_cmd jq
require_cmd docker
require_cmd curl

stack_up() {
  curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT_GATEWAY}/health" >/dev/null 2>&1
}

wait_for_stack() {
  local max_wait="${PERF_BENCHMARK_WAIT_STACK:-120}"
  local elapsed=0
  if stack_up; then
    return 0
  fi
  echo "⏳ Stack DOWN — attente gateway (max ${max_wait}s)…"
  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 5
    elapsed=$((elapsed + 5))
    if stack_up; then
      echo "✅ Stack UP après ${elapsed}s"
      return 0
    fi
  done
  echo "⚠ Stack toujours DOWN après ${max_wait}s — scénarios backend/E2E ignorés"
  return 1
}

snapshot() {
  local label="$1"
  local path
  path="$(./scripts/dev/perf-snapshot.sh --label "$label" 2>/dev/null | head -1)"
  if [ -f "$path" ]; then
    cp "$path" "${OUT_DIR}/${label}.json"
    echo "$path"
  else
    echo ""
  fi
}

run_scenario() {
  local id="$1"
  local name="$2"
  local category="$3"
  shift 3
  local cmd=("$@")

  echo ""
  echo "━━━ [$id] $name ($category) ━━━"
  local before after
  before="$(snapshot "${id}-before")"
  local t0
  t0=$(date +%s)
  local exit_code=0
  set +e
  "${cmd[@]}" >/dev/null 2>&1
  exit_code=$?
  set -e
  sleep 2
  after="$(snapshot "${id}-after")"
  local duration=$(( $(date +%s) - t0 ))

  jq -n \
    --arg id "$id" --arg name "$name" --arg category "$category" \
    --arg before "${OUT_DIR}/${id}-before.json" \
    --arg after "${OUT_DIR}/${id}-after.json" \
    --argjson exit_code "$exit_code" --argjson duration_s "$duration" \
    '{id:$id, name:$name, category:$category, before:$before, after:$after, exit_code:$exit_code, duration_s:$duration_s}' \
    >> "${OUT_DIR}/scenarios.jsonl"

  if [ -n "$before" ] && [ -n "$after" ] && [ -f "${OUT_DIR}/${id}-before.json" ] && [ -f "${OUT_DIR}/${id}-after.json" ]; then
    local cpu_b cpu_a mem_b mem_a
    cpu_b=$(jq '.totals.cpu_pct_sum // 0' "${OUT_DIR}/${id}-before.json")
    cpu_a=$(jq '.totals.cpu_pct_sum // 0' "${OUT_DIR}/${id}-after.json")
    mem_b=$(jq '.totals.memory_mib_sum // 0' "${OUT_DIR}/${id}-before.json")
    mem_a=$(jq '.totals.memory_mib_sum // 0' "${OUT_DIR}/${id}-after.json")
    printf "   durée %ss | CPU Σ %.1f→%.1f%% | MEM Σ %.0f→%.0f MiB | exit %s\n" \
      "$duration" "$cpu_b" "$cpu_a" "$mem_b" "$mem_a" "$exit_code"
  else
    printf "   durée %ss | exit %s\n" "$duration" "$exit_code"
  fi
}

health_storm() {
  local i
  for i in $(seq 1 40); do
    curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT_GATEWAY}/health" >/dev/null || true
    curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT_GATEWAY}/auth/health" >/dev/null || true
    curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT_GATEWAY}/mail/health" >/dev/null || true
    curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT_GATEWAY}/drive/health" >/dev/null || true
  done
}

parallel_health() {
  local i
  for i in $(seq 1 20); do
    curl -sf "http://127.0.0.1:${PORT_GATEWAY}/health" >/dev/null &
  done
  wait
}

gateway_routes() {
  curl -sf "http://127.0.0.1:${PORT_GATEWAY}/health" >/dev/null || true
  curl -sf "http://127.0.0.1:${PORT_DASHBOARD}/" >/dev/null || true
  curl -sf -o /dev/null -w '' -X POST "http://127.0.0.1:${PORT_GATEWAY}/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"x@y.z","password":"wrong","tenant_id":"1"}' || true
}

encryption_container_check() {
  docker exec cloudity-mail-directory-service sh -c \
    'test -n "$MAIL_PASSWORD_ENCRYPTION_KEY" && test "$MAIL_PASSWORD_ENCRYPTION_KEY" != "0000000000000000000000000000000000000000000000000000000000000000"' \
    2>/dev/null || return 1
  docker exec cloudity-postgres psql -U cloudity_admin -d cloudity -tAc \
    "SELECT count(*) FROM user_email_accounts WHERE password_encrypted IS NOT NULL AND password_encrypted <> '';" \
    >/dev/null 2>&1 || true
}

volume_df() {
  docker exec cloudity-postgres df -h /var/lib/postgresql/data 2>/dev/null || true
  docker system df -v 2>/dev/null | grep -E '^cloudity_' || true
}

redis_ping() {
  docker exec cloudity-redis redis-cli PING >/dev/null 2>&1 || true
  local i
  for i in $(seq 1 100); do
    docker exec cloudity-redis redis-cli PING >/dev/null 2>&1 || true
  done
}

combined_health_vitest() {
  health_storm
  make test-dashboard-one FILE=src/layouts/AppLayout.test.tsx
}

combined_health_flutter() {
  health_storm
  cd mobile/cloudity_shared && flutter test
}

load_10_clients() {
  for _ in $(seq 1 10); do
    (while true; do curl -sf "http://127.0.0.1:${PORT_GATEWAY}/health" >/dev/null || sleep 1; done) &
  done
  sleep 8
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
}

load_parallel_drive_health() {
  local i
  for i in $(seq 1 25); do
    curl -sf "http://127.0.0.1:${PORT_GATEWAY}/drive/health" >/dev/null &
  done
  wait
}

echo "========================================"
echo "  CLOUDITY perf-benchmark-suite"
echo "  Run ID : $RUN_ID"
echo "  Sortie : $OUT_DIR"
echo "  Stack  : $(stack_up && echo UP || echo DOWN — scénarios backend/E2E seront ignorés)"
echo "========================================"

wait_for_stack || true

: > "${OUT_DIR}/scenarios.jsonl"
snapshot "00-baseline-idle" >/dev/null
sleep 3

# --- Backend (conteneurs) ---
if stack_up; then
  run_scenario "01" "Health storm gateway" "backend" health_storm
  run_scenario "02" "Health parallèle gateway" "backend" parallel_health
  run_scenario "03" "Routes gateway + dashboard" "backend-web" gateway_routes
  run_scenario "04" "Redis ping x100" "backend" redis_ping
  run_scenario "05" "Volumes + df Postgres" "backend-io" volume_df
  run_scenario "06" "Chiffrement app (conteneur)" "backend-security" encryption_container_check
else
  echo "⏭️  Scénarios 01-06 ignorés (stack down)"
fi

# --- Tests backend Docker ---
if stack_up; then
  run_scenario "07" "go test contacts-service" "backend-test" \
    make test-go-one SERVICE=contacts-service
  run_scenario "08" "go test auth-service" "backend-test" \
    make test-go-one SERVICE=auth-service
else
  run_scenario "07" "go test contacts-service" "backend-test" \
    make test-go-one SERVICE=contacts-service
fi

if [ "${PERF_BENCHMARK_QUICK:-}" != "1" ] && stack_up; then
  run_scenario "09" "go test drive-service" "backend-test" \
    make test-go-one SERVICE=drive-service
  run_scenario "10" "go test mail-directory-service" "backend-test" \
    make test-go-one SERVICE=mail-directory-service
fi

# --- Frontend web (Vitest Docker) ---
run_scenario "11" "Vitest AppLayout" "frontend-web" \
  make test-dashboard-one FILE=src/layouts/AppLayout.test.tsx

if [ "${PERF_BENCHMARK_QUICK:-}" != "1" ]; then
  run_scenario "12" "Vitest api.test (extrait)" "frontend-web" \
    make test-dashboard-one FILE=src/api.test.ts
fi

# --- E2E léger ---
if stack_up; then
  run_scenario "13" "test-e2e health/proxy" "backend-frontend-web" \
    make test-e2e
else
  echo "⏭️  Scénario 13 ignoré (stack down)"
fi

# --- Mobile hôte (Flutter unit, pas ADB) ---
if [ "${PERF_BENCHMARK_SKIP_MOBILE:-}" != "1" ] && command -v flutter >/dev/null 2>&1; then
  run_scenario "14" "flutter test cloudity_shared" "frontend-mobile" \
    bash -c 'cd mobile/cloudity_shared && flutter test'
  if [ "${PERF_BENCHMARK_QUICK:-}" != "1" ] && [ -d mobile/photos/test ]; then
    run_scenario "15" "flutter test photos (hôte)" "frontend-mobile" \
      bash -c 'cd mobile/photos && flutter test'
  fi
else
  echo "⏭️  Scénarios mobile ignorés (flutter absent ou PERF_BENCHMARK_SKIP_MOBILE=1)"
fi

# --- Combinaisons ---
if stack_up; then
  run_scenario "16" "Backend+web : health + vitest" "combined" combined_health_vitest
fi

if stack_up && command -v flutter >/dev/null 2>&1 && [ "${PERF_BENCHMARK_SKIP_MOBILE:-}" != "1" ]; then
  run_scenario "17" "Backend+mobile : health + flutter shared" "combined" combined_health_flutter
fi

if stack_up; then
  run_scenario "18" "Simul. 10 clients /health" "load" load_10_clients
  if [ "${PERF_BENCHMARK_QUICK:-}" != "1" ]; then
    run_scenario "19" "Simul. téléchargements health parallèles" "load" load_parallel_drive_health
  fi
fi

snapshot "20-final-idle" >/dev/null
sleep 2

./scripts/dev/perf-report-generate.sh "$OUT_DIR"

echo ""
echo "✅ Benchmark terminé."
echo "   Rapport : ${OUT_DIR}/REPORT.md"
echo "   Données : ${OUT_DIR}/"
