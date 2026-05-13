#!/usr/bin/env bash
# Cloudity — surveillance ressources en temps réel (CLI uniquement, pas d'UI).
#
# Affiche en boucle :
#   - CPU % / MEM (MiB) / NET I/O / BLOCK I/O / PIDs par conteneur cloudity-*
#   - Totaux Cloudity (CPU agrégé, MEM agrégée)
#   - Top 5 conteneurs gourmands (CPU et MEM)
#   - Comparaison avec budgets PERF_BUDGET_* (LOAD, CONTAINER_CPU_PCT, MEMORY_MB)
#   - Charge système (loadavg 1/5/15 min)
#
# Budgets lus depuis l'environnement (sinon valeurs raisonnables par défaut sur
# laptop dev = 8 vCPU / 16 GiB) :
#   PERF_BUDGET_LOADAVG_1M               (default 6.0)
#   PERF_BUDGET_CONTAINER_CPU_PCT        (default 80   — par conteneur)
#   PERF_BUDGET_TOTAL_CPU_PCT            (default 200  — somme tous conteneurs)
#   PERF_BUDGET_CONTAINER_MEMORY_MB      (default 600  — par conteneur)
#   PERF_BUDGET_TOTAL_MEMORY_MB          (default 4096 — somme tous conteneurs)
#
# Usage :
#   ./scripts/dev/perf-watch.sh                  # rafraîchit toutes les 3 s
#   ./scripts/dev/perf-watch.sh --interval 5     # toutes les 5 s
#   ./scripts/dev/perf-watch.sh --once           # une seule passe (pour CI / cron)
#   ./scripts/dev/perf-watch.sh --no-color       # désactive ANSI (pour log file)
#
# N'affecte aucun conteneur (lecture seule sur `docker stats`). Voir
# docs/operations/PERFORMANCES-MONITORING.md.

set -euo pipefail

# Force la locale C pour avoir "." comme séparateur décimal (printf, awk).
# Sinon, en fr_FR, awk produit "2,6" et printf %f le rejette.
export LC_ALL=C
export LANG=C

# --- Args -------------------------------------------------------------------
INTERVAL=3
ONCE=0
USE_COLOR=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="${2:-3}"; shift 2 ;;
    --once)     ONCE=1; shift ;;
    --no-color) USE_COLOR=0; shift ;;
    -h|--help)
      sed -n '2,28p' "$0"; exit 0 ;;
    *)
      echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done

# --- Couleurs ---------------------------------------------------------------
if [[ "$USE_COLOR" == "1" ]] && [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4); BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; DIM=""; RESET=""
fi

# --- Budgets ---------------------------------------------------------------
PERF_BUDGET_LOADAVG_1M="${PERF_BUDGET_LOADAVG_1M:-6.0}"
PERF_BUDGET_CONTAINER_CPU_PCT="${PERF_BUDGET_CONTAINER_CPU_PCT:-80}"
PERF_BUDGET_TOTAL_CPU_PCT="${PERF_BUDGET_TOTAL_CPU_PCT:-200}"
PERF_BUDGET_CONTAINER_MEMORY_MB="${PERF_BUDGET_CONTAINER_MEMORY_MB:-600}"
PERF_BUDGET_TOTAL_MEMORY_MB="${PERF_BUDGET_TOTAL_MEMORY_MB:-4096}"

# --- Helpers ---------------------------------------------------------------
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Manque commande : $1" >&2; exit 1; }
}
require_cmd docker
require_cmd awk

# Couleur cellule selon seuil (pct: float, threshold: float)
color_for() {
  local val="$1" thr="$2"
  awk -v v="$val" -v t="$thr" -v g="$GREEN" -v y="$YELLOW" -v r="$RED" -v R="$RESET" '
    BEGIN {
      if (v + 0 >= t + 0)         printf "%s", r
      else if (v + 0 >= t * 0.7)  printf "%s", y
      else                        printf "%s", g
    }'
}

# --- Boucle ----------------------------------------------------------------
print_once() {
  clear 2>/dev/null || true

  local ts host_load1 host_load5 host_load15
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  read -r host_load1 host_load5 host_load15 _rest < /proc/loadavg

  printf "${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}\n"
  printf "${BOLD}║  Cloudity — perf-watch          ${DIM}%s${RESET}${BOLD}                                    ║${RESET}\n" "$ts"
  printf "${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n"

  # Loadavg système
  local lc; lc=$(color_for "$host_load1" "$PERF_BUDGET_LOADAVG_1M")
  printf "  ${BOLD}Charge système${RESET}        loadavg ${lc}%s${RESET} / %s / %s   ${DIM}(budget 1m=%s)${RESET}\n" \
    "$host_load1" "$host_load5" "$host_load15" "$PERF_BUDGET_LOADAVG_1M"

  # Lecture docker stats en JSON ligne par ligne
  local raw
  raw=$(docker stats --no-stream --format \
    '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}' \
    2>/dev/null | grep -E '^cloudity-' || true)

  if [[ -z "$raw" ]]; then
    printf "\n  ${YELLOW}Aucun conteneur cloudity-* en cours d'exécution. Lance : make up${RESET}\n\n"
    return 0
  fi

  # Header tableau
  printf "\n  ${BOLD}%-32s %8s %14s %14s %14s %5s${RESET}\n" \
    "CONTENEUR" "CPU%" "MEM (MiB)" "NET I/O" "BLOCK I/O" "PIDs"
  printf "  ${DIM}─────────────────────────────────────────────────────────────────────────────────${RESET}\n"

  local total_cpu=0 total_mem_mib=0 over_count=0
  local sorted top_lines
  sorted=$(echo "$raw" | awk -F'|' '{
    cpu = $2; gsub("%","",cpu); cpu += 0
    mem_pair = $3
    n = split(mem_pair, parts, " / ")
    used = parts[1]
    # Convertir KiB / MiB / GiB en MiB
    val = used
    factor = 1
    if (used ~ /KiB/) { factor = 1/1024 }
    else if (used ~ /MiB/) { factor = 1 }
    else if (used ~ /GiB/) { factor = 1024 }
    else if (used ~ /B$/)  { factor = 1/(1024*1024) }
    gsub("[A-Za-z]","",used)
    used += 0
    used_mib = used * factor
    printf "%s|%.2f|%.1f|%s|%s|%s\n", $1, cpu, used_mib, $5, $6, $7
  }')

  # Tri par conteneur (ordre alpha pour lisibilité)
  while IFS='|' read -r name cpu mem_mib netio blockio pids; do
    [[ -z "$name" ]] && continue
    local cc mc warn
    cc=$(color_for "$cpu" "$PERF_BUDGET_CONTAINER_CPU_PCT")
    mc=$(color_for "$mem_mib" "$PERF_BUDGET_CONTAINER_MEMORY_MB")

    # Marqueur "!" si dépassement
    warn=""
    if awk -v v="$cpu"     -v t="$PERF_BUDGET_CONTAINER_CPU_PCT"    'BEGIN{exit !(v+0 >= t+0)}'; then warn="${warn}!"; fi
    if awk -v v="$mem_mib" -v t="$PERF_BUDGET_CONTAINER_MEMORY_MB" 'BEGIN{exit !(v+0 >= t+0)}'; then warn="${warn}!"; fi

    printf "  %-32s ${cc}%7.1f%%${RESET} ${mc}%13.1f${RESET} %14s %14s %5s %s\n" \
      "${name#cloudity-}" "$cpu" "$mem_mib" "$netio" "$blockio" "$pids" "${warn:+${RED}${warn}${RESET}}"

    total_cpu=$(awk -v a="$total_cpu" -v b="$cpu"     'BEGIN{printf "%.2f", a + b}')
    total_mem_mib=$(awk -v a="$total_mem_mib" -v b="$mem_mib" 'BEGIN{printf "%.1f", a + b}')
    if [[ -n "$warn" ]]; then over_count=$((over_count + 1)); fi
  done <<< "$(echo "$sorted" | sort)"

  printf "  ${DIM}─────────────────────────────────────────────────────────────────────────────────${RESET}\n"

  # Totaux + budgets globaux
  local tcc tmc
  tcc=$(color_for "$total_cpu"     "$PERF_BUDGET_TOTAL_CPU_PCT")
  tmc=$(color_for "$total_mem_mib" "$PERF_BUDGET_TOTAL_MEMORY_MB")
  printf "  ${BOLD}%-32s${RESET} ${tcc}%7.1f%%${RESET} ${tmc}%13.1f${RESET}   ${DIM}budgets : %s%% CPU / %s MiB${RESET}\n" \
    "TOTAL Cloudity" "$total_cpu" "$total_mem_mib" \
    "$PERF_BUDGET_TOTAL_CPU_PCT" "$PERF_BUDGET_TOTAL_MEMORY_MB"

  # Top 5 CPU et MEM
  printf "\n  ${BOLD}Top 5 CPU${RESET}                              ${BOLD}Top 5 MEM${RESET}\n"
  local top_cpu top_mem
  top_cpu=$(echo "$sorted" | sort -t'|' -k2,2nr | head -5 | awk -F'|' '{printf "%-32s %6.1f%%\n",$1,$2}')
  top_mem=$(echo "$sorted" | sort -t'|' -k3,3nr | head -5 | awk -F'|' '{printf "%-32s %7.1f MiB\n",$1,$3}')
  paste <(echo "$top_cpu") <(echo "$top_mem") | awk -F'\t' '{printf "  %-40s %s\n", $1, $2}'

  # Verdict + budgets
  echo
  if [[ "$over_count" -eq 0 ]]; then
    printf "  ${GREEN}OK — aucun dépassement de budget par conteneur${RESET}\n"
  else
    printf "  ${RED}ATTENTION — %d conteneur(s) dépasse(nt) un budget par-conteneur${RESET}\n" "$over_count"
    printf "  ${DIM}Variables : PERF_BUDGET_CONTAINER_CPU_PCT=%s  PERF_BUDGET_CONTAINER_MEMORY_MB=%s${RESET}\n" \
      "$PERF_BUDGET_CONTAINER_CPU_PCT" "$PERF_BUDGET_CONTAINER_MEMORY_MB"
  fi

  if awk -v v="$total_cpu"     -v t="$PERF_BUDGET_TOTAL_CPU_PCT"    'BEGIN{exit !(v+0 >= t+0)}'; then
    printf "  ${RED}TOTAL CPU > budget global (%s%%)${RESET}\n" "$PERF_BUDGET_TOTAL_CPU_PCT"
  fi
  if awk -v v="$total_mem_mib" -v t="$PERF_BUDGET_TOTAL_MEMORY_MB" 'BEGIN{exit !(v+0 >= t+0)}'; then
    printf "  ${RED}TOTAL MEM > budget global (%s MiB)${RESET}\n" "$PERF_BUDGET_TOTAL_MEMORY_MB"
  fi

  printf "\n  ${DIM}Snapshot ponctuel : ${RESET}${BOLD}make perf-snapshot${RESET}${DIM}  ·  Comparer avant/après : ${RESET}${BOLD}make perf-diff${RESET}\n"
  printf "  ${DIM}Doc : docs/operations/PERFORMANCES-MONITORING.md${RESET}\n\n"
}

if [[ "$ONCE" == "1" ]]; then
  print_once
  exit 0
fi

trap 'tput cnorm 2>/dev/null || true; exit 0' INT TERM
tput civis 2>/dev/null || true
while true; do
  print_once
  sleep "$INTERVAL"
done
