#!/usr/bin/env bash
# Cloudity — capture un snapshot horodaté des ressources et le sauvegarde
# dans reports/perf/<timestamp>.json (gitignoré).
#
# Le snapshot capture (à un instant t) :
#   - timestamp ISO 8601 + label (--label "before-pass-feature")
#   - loadavg 1m / 5m / 15m
#   - docker stats : CPU% / MEM (parsé en MiB) / NET I/O / BLOCK I/O / PIDs
#                    pour chaque conteneur cloudity-*
#   - tailles d'images Docker cloudity-* (MiB)
#   - tailles des volumes nommés cloudity_* (MiB, via docker system df -v)
#   - latence /health de chaque service (ms via curl --max-time 3)
#   - métriques Postgres : pg_database_size + nb connexions actives
#
# Usage :
#   ./scripts/dev/perf-snapshot.sh
#   ./scripts/dev/perf-snapshot.sh --label before-refactor-mailpage
#   ./scripts/dev/perf-snapshot.sh --label after-refactor-mailpage
#
# Compare ensuite avec : ./scripts/dev/perf-diff.sh <BEFORE> <AFTER>
#
# Sortie : chemin du fichier JSON créé (à coller dans la description de PR).

set -euo pipefail

# Force la locale C pour le format décimal "." cohérent (printf, awk).
export LC_ALL=C
export LANG=C

cd "$(dirname "$0")/../.."
REPORTS_DIR="reports/perf"
mkdir -p "$REPORTS_DIR"

LABEL="snapshot"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done

TS=$(date -u '+%Y%m%dT%H%M%SZ')
SAFE_LABEL=$(echo "$LABEL" | tr -c '[:alnum:]._-' '-')
OUT="$REPORTS_DIR/${TS}-${SAFE_LABEL}.json"

# --- Helpers ---------------------------------------------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Manque commande : $1" >&2; exit 1; }; }
require_cmd docker
require_cmd awk
require_cmd jq

mem_to_mib() {
  # Convertit en MiB (float). Accepte les deux notations Docker :
  #   docker stats   → MiB / GiB / KiB (binaire IEC)
  #   docker images  → MB  / GB  / kB  (décimal SI, sans 'i')
  # Distingue bien GiB (1024^3) de GB (1000^3).
  local raw="$1"
  awk -v r="$raw" 'BEGIN{
    val=r; gsub("[A-Za-z]","",val); val += 0
    factor = 1
    if (r ~ /KiB/)      factor = 1/1024
    else if (r ~ /MiB/) factor = 1
    else if (r ~ /GiB/) factor = 1024
    else if (r ~ /TiB/) factor = 1024*1024
    else if (r ~ /TB$/) factor = 1000*1000*1000*1000/(1024*1024)
    else if (r ~ /GB$/) factor = 1000*1000*1000/(1024*1024)
    else if (r ~ /MB$/) factor = 1000*1000/(1024*1024)
    else if (r ~ /[kK]B$/) factor = 1000/(1024*1024)
    else if (r ~ /B$/)  factor = 1/(1024*1024)
    printf "%.3f", val * factor
  }'
}

# --- Loadavg ---------------------------------------------------------------
read -r L1 L5 L15 _ < /proc/loadavg

# --- docker stats ----------------------------------------------------------
STATS_JSON='[]'
RAW=$(docker stats --no-stream --format \
  '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}' \
  2>/dev/null | grep -E '^cloudity-' || true)

if [[ -n "$RAW" ]]; then
  while IFS='|' read -r name cpu mem mem_pct netio blockio pids; do
    [[ -z "$name" ]] && continue
    cpu_n="${cpu%\%}"
    used="${mem%% / *}"
    used_mib=$(mem_to_mib "$used")
    STATS_JSON=$(echo "$STATS_JSON" | jq \
      --arg name "$name" --arg cpu "$cpu_n" --arg mem_mib "$used_mib" \
      --arg mem_pct "${mem_pct%\%}" --arg netio "$netio" --arg blockio "$blockio" --arg pids "$pids" \
      '. + [{name:$name, cpu_pct:($cpu|tonumber), memory_mib:($mem_mib|tonumber), memory_pct:($mem_pct|tonumber), net_io:$netio, block_io:$blockio, pids:($pids|tonumber)}]')
  done <<< "$RAW"
fi

# --- Images Docker ---------------------------------------------------------
IMAGES_JSON='[]'
IMG_RAW=$(docker images --format '{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}' \
  | grep -E '^(cloudity[-/]|.*cloudity)' || true)
while IFS='|' read -r repo tag size created; do
  [[ -z "$repo" ]] && continue
  size_mib=$(mem_to_mib "$size")
  IMAGES_JSON=$(echo "$IMAGES_JSON" | jq \
    --arg repo "$repo" --arg tag "$tag" --arg size_mib "$size_mib" --arg created "$created" \
    '. + [{repository:$repo, tag:$tag, size_mib:($size_mib|tonumber), created:$created}]')
done <<< "$IMG_RAW"

# --- Volumes (docker system df -v) -----------------------------------------
VOLUMES_JSON='[]'
VOL_RAW=$(docker system df -v --format '{{json .Volumes}}' 2>/dev/null \
  | jq -r '.[] | select(.Name | test("^cloudity_")) | "\(.Name)|\(.Size)"' 2>/dev/null || true)
while IFS='|' read -r vname vsize; do
  [[ -z "$vname" ]] && continue
  size_mib=$(mem_to_mib "$vsize")
  VOLUMES_JSON=$(echo "$VOLUMES_JSON" | jq \
    --arg name "$vname" --arg size_mib "$size_mib" \
    '. + [{name:$name, size_mib:($size_mib|tonumber)}]')
done <<< "$VOL_RAW"

# --- Latences /health par service -----------------------------------------
HEALTH_JSON='[]'
declare -A SVC_PORTS=(
  [api-gateway]=6000
  [auth-service]=6001
  [admin-service]=6082
  [passwords-service]=6004
  [drive-service]=6005
  [mail-directory]=6006
  [photos-service]=6007
  [calendar-service]=6008
  [contacts-service]=6009
  [notes-service]=6010
  [tasks-service]=6011
  [cloudity-web]=6080
)
for svc in "${!SVC_PORTS[@]}"; do
  port="${SVC_PORTS[$svc]}"
  url="http://localhost:${port}/health"
  if [[ "$svc" == "cloudity-web" ]]; then
    url="http://localhost:${port}/"
  fi
  ms=$(curl -s -o /dev/null -w '%{time_total}\n' --max-time 3 "$url" 2>/dev/null || echo "")
  if [[ -n "$ms" ]]; then
    ms_int=$(awk -v t="$ms" 'BEGIN{printf "%.0f", t*1000}')
    HEALTH_JSON=$(echo "$HEALTH_JSON" | jq \
      --arg svc "$svc" --arg url "$url" --arg ms "$ms_int" \
      '. + [{service:$svc, url:$url, latency_ms:($ms|tonumber), ok:true}]')
  else
    HEALTH_JSON=$(echo "$HEALTH_JSON" | jq \
      --arg svc "$svc" --arg url "$url" \
      '. + [{service:$svc, url:$url, latency_ms:null, ok:false}]')
  fi
done

# --- Postgres : taille DB + connexions ------------------------------------
PG_JSON='null'
if docker ps --format '{{.Names}}' | grep -q '^cloudity-postgres$'; then
  pg_size=$(docker exec cloudity-postgres psql -U cloudity_admin -d cloudity -tAc \
    "SELECT pg_database_size('cloudity');" 2>/dev/null || echo "")
  pg_conn=$(docker exec cloudity-postgres psql -U cloudity_admin -d cloudity -tAc \
    "SELECT count(*) FROM pg_stat_activity WHERE datname='cloudity';" 2>/dev/null || echo "")
  if [[ -n "$pg_size" && -n "$pg_conn" ]]; then
    pg_size_mib=$(awk -v b="$pg_size" 'BEGIN{printf "%.2f", b/1024/1024}')
    PG_JSON=$(jq -n --arg size_mib "$pg_size_mib" --arg conn "$pg_conn" \
      '{database_size_mib:($size_mib|tonumber), active_connections:($conn|tonumber)}')
  fi
fi

# --- Totaux ---------------------------------------------------------------
TOTAL_CPU=$(echo "$STATS_JSON" | jq '[.[].cpu_pct] | add // 0')
TOTAL_MEM=$(echo "$STATS_JSON" | jq '[.[].memory_mib] | add // 0')
COUNT=$(echo "$STATS_JSON" | jq 'length')
IMG_TOTAL=$(echo "$IMAGES_JSON" | jq '[.[].size_mib] | add // 0')

# --- Construction du JSON final -------------------------------------------
jq -n \
  --arg label "$LABEL" \
  --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  --arg host "$(hostname)" \
  --arg load1 "$L1" --arg load5 "$L5" --arg load15 "$L15" \
  --argjson stats "$STATS_JSON" \
  --argjson images "$IMAGES_JSON" \
  --argjson volumes "$VOLUMES_JSON" \
  --argjson health "$HEALTH_JSON" \
  --argjson postgres "$PG_JSON" \
  --argjson total_cpu "$TOTAL_CPU" \
  --argjson total_mem "$TOTAL_MEM" \
  --argjson container_count "$COUNT" \
  --argjson images_total_mib "$IMG_TOTAL" \
  '{
     label:$label,
     timestamp_utc:$ts,
     host:$host,
     loadavg:{m1:($load1|tonumber), m5:($load5|tonumber), m15:($load15|tonumber)},
     totals:{
       container_count:$container_count,
       cpu_pct_sum:$total_cpu,
       memory_mib_sum:$total_mem,
       images_size_mib_sum:$images_total_mib
     },
     containers:$stats,
     images:$images,
     volumes:$volumes,
     health:$health,
     postgres:$postgres
   }' > "$OUT"

echo "$OUT"
echo "  -> conteneurs : $COUNT  | CPU sum : $(printf '%.1f' "$TOTAL_CPU") %  | MEM sum : $(printf '%.0f' "$TOTAL_MEM") MiB" >&2
echo "  -> images cloudity-* : $(printf '%.0f' "$IMG_TOTAL") MiB"  >&2
echo "  Pour comparer : ./scripts/dev/perf-diff.sh $OUT <AUTRE_SNAPSHOT>" >&2
