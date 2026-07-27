#!/usr/bin/env bash
# Lit une clé depuis le .env à la racine du dépôt (sans `source .env` — valeurs avec espaces).
#
# Usage :
#   ./scripts/dev/env-get.sh SEED_ADMIN_PASSWORD
#   ./scripts/dev/env-get.sh SEED_ADMIN_EMAIL admin@cloudity.local
#   eval "$(./scripts/dev/env-get.sh --export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD)"
#   source scripts/dev/env-get.sh   # cloudity_env_get KEY [default]

set -euo pipefail

_CLOUDITY_ENV_GET_ROOT="${CLOUDITY_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

cloudity_env_get() {
  local key="$1"
  local default="${2:-}"
  local file="${_CLOUDITY_ENV_GET_ROOT}/.env"
  if [[ ! -f "$file" ]]; then
    printf '%s' "$default"
    return 0
  fi
  local line val
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | tail -1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return 0
  fi
  val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    --export)
      shift
      for key in "$@"; do
        val="$(cloudity_env_get "$key")"
        printf 'export %s=%q\n' "$key" "$val"
      done
      ;;
    -h | --help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      cloudity_env_get "${1:-}" "${2:-}"
      ;;
  esac
fi
