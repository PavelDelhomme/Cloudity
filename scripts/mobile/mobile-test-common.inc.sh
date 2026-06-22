# shellcheck shell=bash
# Fonctions partagées pour scripts/test-mobile-app.sh (Photos, Drive, …).
# Ne pas exécuter seul : source depuis test-mobile-app.sh après avoir défini ROOT.

ROOT_COMMON="${ROOT_COMMON:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=mobile-device-resolve.sh
source "${ROOT_COMMON}/scripts/mobile/mobile-device-resolve.sh"

cloudity_pick_adb_serial() {
  cloudity_resolve_adb_serial "${1:-Cloudity}"
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
  local port="${CLOUDITY_GATEWAY_PORT:-${PORT_GATEWAY:-6002}}"
  if cloudity_android_emulator "$serial"; then
    printf 'http://10.0.2.2:%s' "$port"
    return 0
  fi
  # Téléphone physique (USB) : le LAN est souvent bloqué (firewall) — tunnel ADB fiable.
  if adb -s "$serial" reverse "tcp:${port}" "tcp:${port}" 2>/dev/null; then
    printf 'http://127.0.0.1:%s' "$port"
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
      echo "   → E2E : gateway détectée automatiquement : $CLOUDITY_E2E_GATEWAY (serial=$serial, port=${CLOUDITY_GATEWAY_PORT:-${PORT_GATEWAY:-6002}})" >&2
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
