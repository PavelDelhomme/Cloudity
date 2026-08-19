#!/usr/bin/env bash
# Démarre (ou réutilise) l'AVD Cloudity dédié — copie Samsung S21 FE.
# Usage : make mobile-emulator-cloudity-start
#   CLOUDITY_AVD_NAME=Cloudity_S21_FE CLOUDITY_AVD_PORT=5556 (défauts)
#
# Règle d’or : ne JAMAIS tuer / relancer un AVD déjà up juste parce qu’ADB
# a un trou. On reconnecte, on attend, on ne spawn pas un 2ᵉ qemu.
#
# Cold boot forcé (snapshot cassé) : CLOUDITY_AVD_COLD_BOOT=1
# Lancement stable hors TTY / agent : CLOUDITY_AVD_USE_SYSTEMD=1 (systemd-run --user)
# Arrêt explicite uniquement : make mobile-emulator-cloudity-stop
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=mobile-android-sdk.inc.sh
source "${ROOT}/scripts/mobile/mobile-android-sdk.inc.sh"

AVD_NAME="${CLOUDITY_AVD_NAME:-Cloudity_S21_FE}"
AVD_PORT="${CLOUDITY_AVD_PORT:-5556}"
SERIAL="emulator-${AVD_PORT}"
LOG_FILE="/tmp/cloudity-avd-${AVD_NAME}.log"
PID_FILE="/tmp/cloudity-avd-${AVD_NAME}.pid"
LOCK_FILE="/tmp/cloudity-avd-${AVD_NAME}.lock"
COLD_BOOT="${CLOUDITY_AVD_COLD_BOOT:-0}"
# Hors terminal (CI, agent) : systemd-run par défaut si disponible.
if [[ -z "${CLOUDITY_AVD_USE_SYSTEMD:-}" ]] && ! [[ -t 1 ]] && command -v systemd-run >/dev/null 2>&1; then
  CLOUDITY_AVD_USE_SYSTEMD=1
fi

SDK_ROOT="$(cloudity_android_sdk_root || true)"
EMULATOR="${SDK_ROOT:+$SDK_ROOT/emulator/emulator}"
cloudity_android_sdk_export || true

if [[ ! -d "${HOME}/.android/avd/${AVD_NAME}.avd" ]]; then
  chmod +x "${ROOT}/scripts/mobile/mobile-emulator-cloudity-create.sh"
  "${ROOT}/scripts/mobile/mobile-emulator-cloudity-create.sh"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb requis."
  exit 1
fi
if [[ -z "${SDK_ROOT:-}" || ! -x "${EMULATOR:-}" ]]; then
  echo "❌ SDK Android introuvable (emulator + system-images). Installez le SDK ou exportez ANDROID_SDK_ROOT."
  exit 1
fi
if [[ ! -d "${HOME}/.android/avd/${AVD_NAME}.avd" ]]; then
  echo "❌ AVD ${AVD_NAME} absent. Créez-le (clone Samsung) ou ajustez CLOUDITY_AVD_NAME."
  exit 1
fi

# Ne jamais adb kill-server ici : ça déconnecte l’AVD et pousse à le relancer.
adb start-server >/dev/null 2>&1 || true

cloudity__avd_pids() {
  # Uniquement binaires qemu/emulator (pas le shell/make qui cite l’AVD dans sa cmdline).
  local line bin
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    bin="$(awk '{print $2}' <<<"$line")"
    case "$bin" in
      */qemu-system-*|*/emulator|qemu-system-*|emulator) ;;
      *) continue ;;
    esac
    if [[ "$line" == *"-avd ${AVD_NAME}"* || "$line" == *"-avd=${AVD_NAME}"* \
       || "$line" == *"-port ${AVD_PORT}"* || "$line" == *"-port=${AVD_PORT}"* ]]; then
      awk '{print $1}' <<<"$line"
    fi
  done < <(ps -eo pid=,args= 2>/dev/null || true) | sort -u
}

cloudity__port_busy() {
  # Port console ADB de l’émulateur (5556) ou adb (5557 = port+1).
  local p
  for p in "$AVD_PORT" "$((AVD_PORT + 1))"; do
    if ss -ltn 2>/dev/null | awk -v p=":$p" '$4 ~ p {found=1} END{exit !found}'; then
      return 0
    fi
    if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

cloudity__adb_serial_state() {
  # device | offline | unauthorized | absent
  local line
  line="$(adb devices 2>/dev/null | awk -v s="$SERIAL" '$1==s {print $2; exit}')"
  if [[ -z "$line" ]]; then
    printf 'absent'
  else
    printf '%s' "$line"
  fi
}

cloudity__avd_name_on_serial() {
  adb -s "$1" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r\n' || true
}

cloudity__find_running_serial() {
  local serial name
  # 1) Serial attendu
  if [[ "$(cloudity__adb_serial_state)" == "device" ]]; then
    name="$(cloudity__avd_name_on_serial "$SERIAL")"
    if [[ -z "$name" || "$name" == "$AVD_NAME" ]]; then
      printf '%s' "$SERIAL"
      return 0
    fi
  fi
  # 2) Tout émulateur adb « device » portant le bon AVD name
  while IFS= read -r serial; do
    [[ -z "$serial" ]] && continue
    name="$(cloudity__avd_name_on_serial "$serial")"
    if [[ "$name" == "$AVD_NAME" ]]; then
      printf '%s' "$serial"
      return 0
    fi
  done < <(adb devices 2>/dev/null | awk '/^emulator-.*\tdevice$/ {print $1}')
  return 1
}

cloudity__wait_boot() {
  local serial="$1"
  local timeout="${2:-180}"
  local elapsed=0
  local state
  echo "   Attente boot ADB ${serial}…"
  while (( elapsed < timeout )); do
    state="$(adb devices 2>/dev/null | awk -v s="$serial" '$1==s {print $2; exit}')"
    if [[ "$state" == "device" ]]; then
      if [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)" == "1" ]]; then
        return 0
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

cloudity__print_ready() {
  local serial="$1"
  local mode="${2:-ok}"
  local name size density
  name="$(adb -s "$serial" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r\n')"
  size="$(adb -s "$serial" shell wm size 2>/dev/null | awk '/Physical size/ {print $3}' | tr -d '\r\n')"
  density="$(adb -s "$serial" shell wm density 2>/dev/null | awk '/Physical density/ {print $3}' | tr -d '\r\n')"
  case "$mode" in
    reuse) echo "✅ ${serial} déjà prêt — AVD=${name:-$AVD_NAME} · écran=${size:-?} · dpi=${density:-?} (aucune relance)" ;;
    reconnect) echo "✅ ${serial} reconnecté — AVD=${name:-$AVD_NAME} · écran=${size:-?} · dpi=${density:-?} (qemu inchangé)" ;;
    *) echo "✅ ${serial} prêt — AVD=${name:-$AVD_NAME} · écran=${size:-?} · dpi=${density:-?}" ;;
  esac
}

cloudity__try_reuse() {
  # Retourne 0 si l’AVD est utilisable (déjà up ou reconnecté). Pas de flock.
  local running pids
  if running="$(cloudity__find_running_serial)"; then
    echo "✅ AVD ${AVD_NAME} déjà actif : ${running} — aucune relance (JobbingTrack / Samsung physiques inchangés)"
    cloudity__print_ready "$running" reuse
    return 0
  fi

  pids="$(cloudity__avd_pids || true)"
  if [[ -n "${pids}" ]] || cloudity__port_busy; then
    echo "♻️  AVD ${AVD_NAME} déjà en cours (PID: ${pids:-port ${AVD_PORT} occupé}) — reconnexion ADB, pas de redémarrage"
    adb start-server >/dev/null 2>&1 || true
    adb devices >/dev/null 2>&1 || true
    if cloudity__wait_boot "$SERIAL" 90; then
      cloudity__print_ready "$SERIAL" reconnect
      return 0
    fi
    if running="$(cloudity__find_running_serial)"; then
      cloudity__print_ready "$running" reconnect
      return 0
    fi
    echo "⚠️  Processus présent mais ADB ne voit pas ${SERIAL} après 90s."
    echo "    On ne kill PAS l’émulateur. Essayez : adb reconnect  ·  ou make mobile-emulator-cloudity-stop puis start"
    echo "    PIDs : ${pids:-?} · logs : ${LOG_FILE}"
    return 1
  fi
  return 2  # rien qui tourne → il faut démarrer
}

# --- Chemin rapide : réutiliser sans prendre le verrou ---
reuse_rc=0
cloudity__try_reuse || reuse_rc=$?
if [[ "$reuse_rc" -eq 0 ]]; then
  exit 0
fi
if [[ "$reuse_rc" -eq 1 ]]; then
  exit 1
fi

# --- Verrou uniquement pour un vrai démarrage (évite 2 qemu) ---
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "⏳ Un autre démarrage ${AVD_NAME} est en cours — on attend qu’il finisse (pas de 2ᵉ qemu)…"
  # Pendant l’attente : si l’AVD apparaît, on sort sans bloquer éternellement
  waited=0
  while ! flock -n 9; do
    if running="$(cloudity__find_running_serial)"; then
      echo "✅ AVD apparu pendant l’attente : ${running}"
      cloudity__print_ready "$running" reuse
      exit 0
    fi
    if (( waited >= 180 )); then
      echo "❌ Timeout attente verrou démarrage (180s)."
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
fi

# Re-check sous verrou (autre process a pu démarrer entre-temps)
reuse_rc=0
cloudity__try_reuse || reuse_rc=$?
if [[ "$reuse_rc" -eq 0 ]]; then
  exit 0
fi
if [[ "$reuse_rc" -eq 1 ]]; then
  exit 1
fi

# --- Vrai cold/warm start (rien qui tourne) ---
EMU_ARGS=(-avd "$AVD_NAME" -port "$AVD_PORT" -no-boot-anim)
if [[ "$COLD_BOOT" == "1" ]]; then
  EMU_ARGS+=(-no-snapshot-load)
  echo "🚀 Cold boot AVD ${AVD_NAME} sur ${AVD_PORT} (CLOUDITY_AVD_COLD_BOOT=1, SDK=${SDK_ROOT})…"
else
  # Snapshot quick-boot si dispo — évite le reboot complet à chaque fois
  echo "🚀 Démarrage AVD ${AVD_NAME} sur ${AVD_PORT} (snapshot si dispo, SDK=${SDK_ROOT})…"
fi

cloudity__launch_emulator() {
  local emu_pid
  if [[ "${CLOUDITY_AVD_USE_SYSTEMD:-0}" == "1" ]] && command -v systemd-run >/dev/null 2>&1; then
    echo "   Mode systemd-run (CLOUDITY_AVD_USE_SYSTEMD=1, SDK=${SDK_ROOT})…"
    systemd-run --user --unit="cloudity-avd-${AVD_NAME}" --collect \
      -p "Environment=HOME=${HOME}" \
      -p "Environment=ANDROID_SDK_ROOT=${SDK_ROOT}" \
      -p "Environment=ANDROID_HOME=${SDK_ROOT}" \
      -p "Environment=PATH=${SDK_ROOT}/emulator:${SDK_ROOT}/platform-tools:${PATH}" \
      "${EMULATOR}" "${EMU_ARGS[@]}" >>"$LOG_FILE" 2>&1 || return 1
    # Attendre le PID qemu sous l'unité user
    sleep 3
    emu_pid="$(cloudity__avd_pids | head -1 || true)"
    if [[ -n "$emu_pid" ]]; then
      echo "$emu_pid" >"$PID_FILE"
      echo "   PID ${emu_pid} (systemd cloudity-avd-${AVD_NAME}) · logs : ${LOG_FILE}"
      return 0
    fi
    echo "⚠️  systemd-run lancé mais PID qemu introuvable — bascule nohup"
  fi
  ANDROID_SDK_ROOT="$SDK_ROOT" ANDROID_HOME="$SDK_ROOT" \
    setsid "$EMULATOR" "${EMU_ARGS[@]}" >>"$LOG_FILE" 2>&1 &
  emu_pid=$!
  echo "$emu_pid" >"$PID_FILE"
  echo "   PID ${emu_pid} · logs : ${LOG_FILE}"
}

cloudity__launch_emulator
emu_pid="$(cat "$PID_FILE" 2>/dev/null || true)"

# Laisse qemu binder le port avant wait-for-device
sleep 2
if ! kill -0 "$emu_pid" 2>/dev/null; then
  # Souvent : « Running multiple emulators with the same AVD » → réutiliser
  if cloudity__port_busy || [[ -n "$(cloudity__avd_pids || true)" ]]; then
    echo "♻️  Lancement refusé (AVD déjà pris) — bascule en réutilisation"
    if cloudity__wait_boot "$SERIAL" 90; then
      cloudity__print_ready "$SERIAL" reconnect
      exit 0
    fi
  fi
  echo "❌ L'émulateur s'est arrêté immédiatement. Voir ${LOG_FILE}"
  tail -30 "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

adb -s "$SERIAL" wait-for-device

boot_timeout=180
elapsed=0
while [[ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)" != "1" ]]; do
  if ! kill -0 "$emu_pid" 2>/dev/null; then
    echo "❌ L'émulateur s'est arrêté. Voir ${LOG_FILE}"
    tail -20 "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
  if (( elapsed >= boot_timeout )); then
    echo "❌ Timeout boot ${SERIAL} (${boot_timeout}s). Voir ${LOG_FILE}"
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

cloudity__print_ready "$SERIAL" start
