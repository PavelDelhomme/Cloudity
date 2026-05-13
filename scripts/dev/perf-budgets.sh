#!/usr/bin/env bash
# Cloudity — vérifie que la stack actuelle respecte les budgets de ressources.
#
# Conçu pour être lancé en pré-commit, en CI, ou en cron : sortie courte,
# exit code 0 si tout est OK, 1 si un budget est dépassé.
#
# Variables :
#   PERF_BUDGET_LOADAVG_1M               default 6.0
#   PERF_BUDGET_CONTAINER_CPU_PCT        default 80   (par conteneur)
#   PERF_BUDGET_TOTAL_CPU_PCT            default 200  (somme cloudity-*)
#   PERF_BUDGET_CONTAINER_MEMORY_MB      default 600  (par conteneur)
#   PERF_BUDGET_TOTAL_MEMORY_MB          default 4096 (somme cloudity-*)
#
# Usage :
#   ./scripts/dev/perf-budgets.sh
#   ./scripts/dev/perf-budgets.sh --json     # sortie JSON (pour /admin endpoints)
#   ./scripts/dev/perf-budgets.sh --quiet    # rien sur stdout, exit code only

set -euo pipefail

# Force la locale C pour le format décimal "." (printf, awk).
export LC_ALL=C
export LANG=C

cd "$(dirname "$0")/../.."

JSON_OUT=0
QUIET=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_OUT=1; shift ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done

PERF_BUDGET_LOADAVG_1M="${PERF_BUDGET_LOADAVG_1M:-6.0}"
PERF_BUDGET_CONTAINER_CPU_PCT="${PERF_BUDGET_CONTAINER_CPU_PCT:-80}"
PERF_BUDGET_TOTAL_CPU_PCT="${PERF_BUDGET_TOTAL_CPU_PCT:-200}"
PERF_BUDGET_CONTAINER_MEMORY_MB="${PERF_BUDGET_CONTAINER_MEMORY_MB:-600}"
PERF_BUDGET_TOTAL_MEMORY_MB="${PERF_BUDGET_TOTAL_MEMORY_MB:-4096}"

# Génère un snapshot intermédiaire en mémoire (pas de fichier) en réutilisant
# perf-snapshot.sh dans un --label "_budgets-check" → puis on parse.
TMP=$(mktemp /tmp/cloudity-perf-budgets.XXXXXX.json)
trap 'rm -f "$TMP"' EXIT

# Snapshot rapide (sans /health pour gagner du temps)
read -r L1 _L5 _L15 _ < /proc/loadavg

# docker stats
RAW=$(docker stats --no-stream --format \
  '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null | grep -E '^cloudity-' || true)

violations=()
total_cpu=0
total_mem=0
container_count=0

if [[ -n "$RAW" ]]; then
  while IFS='|' read -r name cpu mem; do
    [[ -z "$name" ]] && continue
    container_count=$((container_count + 1))
    cpu_n="${cpu%\%}"
    used="${mem%% / *}"
    used_mib=$(awk -v r="$used" 'BEGIN{
      val=r; gsub("[A-Za-z]","",val); val += 0
      f = 1
      if (r ~ /KiB/) f = 1/1024
      else if (r ~ /MiB/) f = 1
      else if (r ~ /GiB/) f = 1024
      else if (r ~ /B$/)  f = 1/(1024*1024)
      printf "%.1f", val * f
    }')

    if awk -v v="$cpu_n"   -v t="$PERF_BUDGET_CONTAINER_CPU_PCT"    'BEGIN{exit !(v+0 >= t+0)}'; then
      violations+=("CPU ${name#cloudity-} = ${cpu_n}% (budget ${PERF_BUDGET_CONTAINER_CPU_PCT}%)")
    fi
    if awk -v v="$used_mib" -v t="$PERF_BUDGET_CONTAINER_MEMORY_MB" 'BEGIN{exit !(v+0 >= t+0)}'; then
      violations+=("MEM ${name#cloudity-} = ${used_mib} MiB (budget ${PERF_BUDGET_CONTAINER_MEMORY_MB} MiB)")
    fi
    total_cpu=$(awk -v a="$total_cpu" -v b="$cpu_n"   'BEGIN{printf "%.1f", a + b}')
    total_mem=$(awk -v a="$total_mem" -v b="$used_mib" 'BEGIN{printf "%.1f", a + b}')
  done <<< "$RAW"
fi

if awk -v v="$L1"        -v t="$PERF_BUDGET_LOADAVG_1M"      'BEGIN{exit !(v+0 >= t+0)}'; then
  violations+=("LOADAVG_1M = ${L1} (budget ${PERF_BUDGET_LOADAVG_1M})")
fi
if awk -v v="$total_cpu" -v t="$PERF_BUDGET_TOTAL_CPU_PCT"   'BEGIN{exit !(v+0 >= t+0)}'; then
  violations+=("TOTAL_CPU = ${total_cpu}% (budget ${PERF_BUDGET_TOTAL_CPU_PCT}%)")
fi
if awk -v v="$total_mem" -v t="$PERF_BUDGET_TOTAL_MEMORY_MB" 'BEGIN{exit !(v+0 >= t+0)}'; then
  violations+=("TOTAL_MEM = ${total_mem} MiB (budget ${PERF_BUDGET_TOTAL_MEMORY_MB} MiB)")
fi

n="${#violations[@]}"

if [[ "$JSON_OUT" == "1" ]]; then
  printf '{"ok":%s,"violation_count":%d,"loadavg_1m":%s,"total_cpu_pct":%s,"total_memory_mib":%s,"container_count":%d,"violations":[' \
    "$([[ $n -eq 0 ]] && echo true || echo false)" \
    "$n" "$L1" "$total_cpu" "$total_mem" "$container_count"
  for i in "${!violations[@]}"; do
    [[ "$i" -gt 0 ]] && printf ','
    printf '"%s"' "${violations[$i]//\"/\\\"}"
  done
  printf ']}\n'
elif [[ "$QUIET" != "1" ]]; then
  if [[ "$n" -eq 0 ]]; then
    printf 'OK — %d conteneurs cloudity-*, total CPU=%s%%, MEM=%s MiB, loadavg=%s — aucun budget dépassé\n' \
      "$container_count" "$total_cpu" "$total_mem" "$L1"
  else
    printf 'KO — %d violation(s) :\n' "$n"
    for v in "${violations[@]}"; do
      printf '  · %s\n' "$v"
    done
  fi
fi

[[ "$n" -eq 0 ]] && exit 0 || exit 1
