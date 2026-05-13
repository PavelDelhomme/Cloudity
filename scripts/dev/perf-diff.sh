#!/usr/bin/env bash
# Cloudity — compare deux snapshots de perf-snapshot.sh.
#
# Utile pour le rituel "checkpoint perf" : un snapshot AVANT une feature,
# un snapshot APRÈS, on regarde les deltas.
#
# Usage :
#   ./scripts/dev/perf-diff.sh <BEFORE.json> <AFTER.json>
#   ./scripts/dev/perf-diff.sh                  # auto-pick les 2 derniers
#   ./scripts/dev/perf-diff.sh --json BEFORE AFTER  # sortie JSON
#
# Met en évidence :
#   - delta CPU% par conteneur (et au total)
#   - delta MEM (MiB) par conteneur (et au total)
#   - delta latence /health (ms) par service
#   - delta taille images Docker (MiB)
#   - delta loadavg
#   - alertes (rouge) si dégradation > seuils :
#       PERF_DELTA_CPU_PCT          (default 10)   → +10% absolu sur un conteneur
#       PERF_DELTA_MEM_MB           (default 50)   → +50 MiB sur un conteneur
#       PERF_DELTA_HEALTH_MS        (default 200)  → +200 ms sur /health
#
# Exit code : 0 = pas de régression > seuil ; 1 = régression détectée.

set -euo pipefail

# Force la locale C pour le format décimal "." (printf, awk, jq).
export LC_ALL=C
export LANG=C

cd "$(dirname "$0")/../.."

# --- Args -----------------------------------------------------------------
JSON_OUT=0
BEFORE=""
AFTER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_OUT=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *)
      if [[ -z "$BEFORE" ]]; then BEFORE="$1"
      elif [[ -z "$AFTER" ]]; then AFTER="$1"
      else echo "Trop d'arguments : $1" >&2; exit 2
      fi
      shift ;;
  esac
done

REPORTS_DIR="reports/perf"
if [[ -z "$BEFORE" || -z "$AFTER" ]]; then
  if [[ ! -d "$REPORTS_DIR" ]]; then
    echo "Dossier $REPORTS_DIR/ introuvable. Lance d'abord ./scripts/dev/perf-snapshot.sh" >&2
    exit 2
  fi
  mapfile -t SNAPSHOTS < <(ls -1t "$REPORTS_DIR"/*.json 2>/dev/null || true)
  if [[ "${#SNAPSHOTS[@]}" -lt 2 ]]; then
    echo "Pas assez de snapshots dans $REPORTS_DIR (besoin de 2)." >&2
    echo "Lance ./scripts/dev/perf-snapshot.sh --label before-XXX puis --label after-XXX" >&2
    exit 2
  fi
  AFTER="${SNAPSHOTS[0]}"
  BEFORE="${SNAPSHOTS[1]}"
fi

[[ -f "$BEFORE" ]] || { echo "Fichier introuvable : $BEFORE" >&2; exit 2; }
[[ -f "$AFTER"  ]] || { echo "Fichier introuvable : $AFTER"  >&2; exit 2; }

command -v jq >/dev/null 2>&1 || { echo "Manque jq" >&2; exit 1; }

# --- Couleurs -------------------------------------------------------------
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4); BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; DIM=""; RESET=""
fi

PERF_DELTA_CPU_PCT="${PERF_DELTA_CPU_PCT:-10}"
PERF_DELTA_MEM_MB="${PERF_DELTA_MEM_MB:-50}"
PERF_DELTA_HEALTH_MS="${PERF_DELTA_HEALTH_MS:-200}"

# --- Diff JSON via jq -----------------------------------------------------
DIFF=$(jq -n \
  --slurpfile b "$BEFORE" \
  --slurpfile a "$AFTER" \
  '
  def round1(v): (v // 0) | (.*10|round/10);
  def round0(v): (v // 0) | round;

  ($b[0]) as $B | ($a[0]) as $A |
  {
    before_label:        $B.label,
    after_label:         $A.label,
    before_ts:           $B.timestamp_utc,
    after_ts:            $A.timestamp_utc,

    loadavg_delta: {
      m1:  round1($A.loadavg.m1  - $B.loadavg.m1),
      m5:  round1($A.loadavg.m5  - $B.loadavg.m5),
      m15: round1($A.loadavg.m15 - $B.loadavg.m15)
    },

    totals_delta: {
      cpu_pct_sum:        round1($A.totals.cpu_pct_sum    - $B.totals.cpu_pct_sum),
      memory_mib_sum:     round0($A.totals.memory_mib_sum - $B.totals.memory_mib_sum),
      images_size_mib_sum: round0(($A.totals.images_size_mib_sum // 0) - ($B.totals.images_size_mib_sum // 0)),
      container_count:    ($A.totals.container_count - $B.totals.container_count)
    },

    containers_delta: [
      ($A.containers + $B.containers | map(.name) | unique[]) as $name |
      {
        name: $name,
        cpu_pct_delta:    round1((($A.containers[] | select(.name==$name) | .cpu_pct) // 0) -
                                  (($B.containers[] | select(.name==$name) | .cpu_pct) // 0)),
        memory_mib_delta: round0((($A.containers[] | select(.name==$name) | .memory_mib) // 0) -
                                  (($B.containers[] | select(.name==$name) | .memory_mib) // 0)),
        before_cpu:       (($B.containers[] | select(.name==$name) | .cpu_pct) // null),
        after_cpu:        (($A.containers[] | select(.name==$name) | .cpu_pct) // null),
        before_mem_mib:   (($B.containers[] | select(.name==$name) | .memory_mib) // null),
        after_mem_mib:    (($A.containers[] | select(.name==$name) | .memory_mib) // null)
      }
    ],

    health_delta: [
      ($A.health + $B.health | map(.service) | unique[]) as $svc |
      {
        service: $svc,
        latency_ms_delta:
          (if (($B.health[] | select(.service==$svc) | .latency_ms) // null) == null
              or (($A.health[] | select(.service==$svc) | .latency_ms) // null) == null
            then null
            else round0((($A.health[] | select(.service==$svc) | .latency_ms) // 0) -
                         (($B.health[] | select(.service==$svc) | .latency_ms) // 0))
            end),
        before_ms: (($B.health[] | select(.service==$svc) | .latency_ms) // null),
        after_ms:  (($A.health[] | select(.service==$svc) | .latency_ms) // null)
      }
    ]
  }')

# --- Mode --json ----------------------------------------------------------
if [[ "$JSON_OUT" == "1" ]]; then
  echo "$DIFF"
  exit 0
fi

# --- Affichage humain -----------------------------------------------------
B_LABEL=$(echo "$DIFF" | jq -r '.before_label')
A_LABEL=$(echo "$DIFF" | jq -r '.after_label')
B_TS=$(echo "$DIFF" | jq -r '.before_ts')
A_TS=$(echo "$DIFF" | jq -r '.after_ts')

printf "${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}║  Cloudity — perf-diff${RESET}\n"
printf "${BOLD}║${RESET}    BEFORE  ${DIM}%-30s%s${RESET}\n" "$B_LABEL" "  $B_TS"
printf "${BOLD}║${RESET}    AFTER   ${DIM}%-30s%s${RESET}\n" "$A_LABEL" "  $A_TS"
printf "${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n\n"

# Totaux
TC=$(echo "$DIFF" | jq -r '.totals_delta.cpu_pct_sum')
TM=$(echo "$DIFF" | jq -r '.totals_delta.memory_mib_sum')
TI=$(echo "$DIFF" | jq -r '.totals_delta.images_size_mib_sum')
TN=$(echo "$DIFF" | jq -r '.totals_delta.container_count')

printf "  ${BOLD}Totaux Cloudity${RESET}\n"
printf "    Δ CPU sum         : %+8.1f %%\n"   "$TC"
printf "    Δ MEM sum         : %+8.0f MiB\n"  "$TM"
printf "    Δ Images sum      : %+8.0f MiB\n"  "$TI"
printf "    Δ Conteneurs      : %+8d\n\n"      "$TN"

# Loadavg
L1=$(echo "$DIFF" | jq -r '.loadavg_delta.m1')
L5=$(echo "$DIFF" | jq -r '.loadavg_delta.m5')
L15=$(echo "$DIFF" | jq -r '.loadavg_delta.m15')
printf "  ${BOLD}Loadavg${RESET}        Δ 1m=%+5.1f  Δ 5m=%+5.1f  Δ 15m=%+5.1f\n\n" "$L1" "$L5" "$L15"

# Conteneurs (uniquement ceux avec un delta non nul)
printf "  ${BOLD}Conteneurs (delta != 0)${RESET}\n"
printf "  ${DIM}%-32s %12s %12s %20s${RESET}\n" "NOM" "Δ CPU%" "Δ MEM(MiB)" "AVANT → APRÈS"

REGRESSED=0
echo "$DIFF" | jq -r '
  .containers_delta
  | sort_by(-.memory_mib_delta)
  | .[]
  | select(.cpu_pct_delta != 0 or .memory_mib_delta != 0)
  | "\(.name)|\(.cpu_pct_delta)|\(.memory_mib_delta)|\(.before_cpu)|\(.after_cpu)|\(.before_mem_mib)|\(.after_mem_mib)"' \
| while IFS='|' read -r name dcpu dmem bcpu acpu bmem amem; do
    short="${name#cloudity-}"

    # Couleur selon dégradation
    color_cpu="$RESET"
    color_mem="$RESET"
    flag=""
    if awk -v v="$dcpu" -v t="$PERF_DELTA_CPU_PCT" 'BEGIN{exit !(v+0 >= t+0)}'; then
      color_cpu="$RED"; flag="${flag}!"
    elif awk -v v="$dcpu" 'BEGIN{exit !(v+0 < 0)}'; then
      color_cpu="$GREEN"
    fi
    if awk -v v="$dmem" -v t="$PERF_DELTA_MEM_MB" 'BEGIN{exit !(v+0 >= t+0)}'; then
      color_mem="$RED"; flag="${flag}!"
    elif awk -v v="$dmem" 'BEGIN{exit !(v+0 < 0)}'; then
      color_mem="$GREEN"
    fi

    printf "  %-32s ${color_cpu}%+11.1f%%${RESET} ${color_mem}%+11.0f${RESET}  ${DIM}%5s%% → %5s%%, %5s → %5s MiB${RESET} %s\n" \
      "$short" "$dcpu" "$dmem" "$bcpu" "$acpu" "$bmem" "$amem" "${flag:+${RED}${flag}${RESET}}"
  done

# Latences /health
printf "\n  ${BOLD}Latence /health (ms)${RESET}\n"
printf "  ${DIM}%-24s %12s %20s${RESET}\n" "SERVICE" "Δ ms" "AVANT → APRÈS"

echo "$DIFF" | jq -r '
  .health_delta
  | sort_by(-.latency_ms_delta // 0)
  | .[]
  | "\(.service)|\(.latency_ms_delta)|\(.before_ms)|\(.after_ms)"' \
| while IFS='|' read -r svc dms bms ams; do
    if [[ "$dms" == "null" || -z "$dms" ]]; then
      printf "  %-24s ${DIM}%12s %20s${RESET}\n" "$svc" "n/a" "${bms:-?} → ${ams:-?}"
      continue
    fi
    color="$RESET"
    flag=""
    if awk -v v="$dms" -v t="$PERF_DELTA_HEALTH_MS" 'BEGIN{exit !(v+0 >= t+0)}'; then
      color="$RED"; flag="!"
    elif awk -v v="$dms" 'BEGIN{exit !(v+0 < 0)}'; then
      color="$GREEN"
    fi
    printf "  %-24s ${color}%+11d${RESET} ${DIM}%6s → %6s${RESET} %s\n" \
      "$svc" "$dms" "${bms:-?}" "${ams:-?}" "${flag:+${RED}${flag}${RESET}}"
  done

# Verdict
echo
REGRESSIONS=$(echo "$DIFF" | jq --arg cpu_thr "$PERF_DELTA_CPU_PCT" \
                                 --arg mem_thr "$PERF_DELTA_MEM_MB" \
                                 --arg ms_thr  "$PERF_DELTA_HEALTH_MS" '
  [
    (.containers_delta[] | select(.cpu_pct_delta    >= ($cpu_thr|tonumber))),
    (.containers_delta[] | select(.memory_mib_delta >= ($mem_thr|tonumber))),
    (.health_delta[]     | select((.latency_ms_delta // 0) >= ($ms_thr|tonumber)))
  ] | length')

if [[ "$REGRESSIONS" -eq 0 ]]; then
  printf "  ${GREEN}OK — pas de régression au-delà des seuils (%s%% CPU / %s MiB MEM / %s ms latence)${RESET}\n" \
    "$PERF_DELTA_CPU_PCT" "$PERF_DELTA_MEM_MB" "$PERF_DELTA_HEALTH_MS"
  exit 0
else
  printf "  ${RED}ATTENTION — %d régression(s) détectée(s) au-delà des seuils${RESET}\n" "$REGRESSIONS"
  printf "  ${DIM}Variables : PERF_DELTA_CPU_PCT=%s  PERF_DELTA_MEM_MB=%s  PERF_DELTA_HEALTH_MS=%s${RESET}\n" \
    "$PERF_DELTA_CPU_PCT" "$PERF_DELTA_MEM_MB" "$PERF_DELTA_HEALTH_MS"
  exit 1
fi
