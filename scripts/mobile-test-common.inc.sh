# shellcheck shell=bash
# Fonctions partagées pour scripts/test-mobile-app.sh (Photos, Drive, …).
# Ne pas exécuter seul : source depuis test-mobile-app.sh après avoir défini ROOT.

cloudity_pick_adb_serial() {
  local app_label="${1:-Cloudity}"
  local line
  local -a devs=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && devs+=("$line")
  done < <(adb devices 2>/dev/null | awk '/\tdevice$/ {print $1}')

  if [[ ${#devs[@]} -eq 0 ]]; then
    return 1
  fi

  if [[ -n "${CLOUDITY_DEVICE_ID:-}" ]]; then
    printf '%s' "${CLOUDITY_DEVICE_ID}"
    return 0
  fi
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s' "${ANDROID_SERIAL}"
    return 0
  fi
  if [[ ${#devs[@]} -eq 1 ]]; then
    echo "   → ADB : un appareil (${devs[0]})" >&2
    printf '%s' "${devs[0]}"
    return 0
  fi

  if [[ -t 0 ]] && [[ -t 1 ]]; then
    echo "Plusieurs appareils ADB (état « device ») :" >&2
    local PS3="Numéro à utiliser pour integration_test ${app_label} : "
    local choice
    select choice in "${devs[@]}"; do
      if [[ -n "${choice:-}" ]]; then
        printf '%s' "$choice"
        return 0
      fi
      echo "Choix invalide." >&2
    done
  fi

  echo "⚠️  Plusieurs appareils : ${devs[*]}" >&2
  echo "    Mode non interactif — utilisation du premier. Précisez : export CLOUDITY_DEVICE_ID=<serial>" >&2
  printf '%s' "${devs[0]}"
  return 0
}

cloudity_android_emulator() {
  local serial="$1"
  local hw qemu
  [[ "$serial" == emulator-* ]] && return 0
  qemu="$(adb -s "$serial" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r\n' || true)"
  [[ "$qemu" == "1" ]] && return 0
  hw="$(adb -s "$serial" shell getprop ro.hardware 2>/dev/null | tr -d '\r\n' | tr '[:upper:]' '[:lower:]' || true)"
  [[ "$hw" == "ranchu" || "$hw" == "goldfish" ]] && return 0
  return 1
}

cloudity_lan_ipv4() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
  fi
  if [[ -z "$ip" || "$ip" == "127.0.0.1" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i !~ /^127\./) { print $i; exit } }')"
  fi
  [[ -n "$ip" && "$ip" != "127.0.0.1" ]] && printf '%s' "$ip" && return 0
  return 1
}

cloudity_auto_e2e_gateway() {
  local serial="$1"
  local port="${CLOUDITY_GATEWAY_PORT:-6080}"
  if cloudity_android_emulator "$serial"; then
    printf 'http://10.0.2.2:%s' "$port"
    return 0
  fi
  local lan
  if lan="$(cloudity_lan_ipv4)"; then
    printf 'http://%s:%s' "$lan" "$port"
    return 0
  fi
  return 1
}

# Prépare CLOUDITY_E2E_* (gateway auto + défauts démo) pour le serial ADB courant.
cloudity_prepare_e2e_env() {
  local serial="$1"
  if [[ -z "${CLOUDITY_E2E_GATEWAY:-}" && "${CLOUDITY_E2E_NO_AUTO:-}" != "1" ]]; then
    if gw="$(cloudity_auto_e2e_gateway "$serial")"; then
      CLOUDITY_E2E_GATEWAY="$gw"
      echo "   → E2E : gateway détectée automatiquement : $CLOUDITY_E2E_GATEWAY (serial=$serial, port=${CLOUDITY_GATEWAY_PORT:-6080})" >&2
    else
      echo "   ⚠️  E2E : impossible de deviner CLOUDITY_E2E_GATEWAY (réseau ?). Définis-la à la main ou vérifie ip/hostname." >&2
    fi
  fi
  if [[ -n "${CLOUDITY_E2E_GATEWAY:-}" ]]; then
    : "${CLOUDITY_E2E_EMAIL:=admin@cloudity.local}"
    : "${CLOUDITY_E2E_PASSWORD:=Admin123!}"
    : "${CLOUDITY_E2E_TENANT:=1}"
  fi
}
