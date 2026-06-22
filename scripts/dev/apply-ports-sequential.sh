#!/usr/bin/env bash
# Applique la série séquentielle PORT_* dans .env et aligne VITE_API_URL / mobile / OAuth callback.
# Usage : ./scripts/dev/apply-ports-sequential.sh [--dry-run]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

# shellcheck source=scripts/dev/ports-sequential.sh
source "$ROOT/scripts/dev/ports-sequential.sh"

ENV_FILE="${ROOT}/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env absent — lancer make setup d'abord."
  exit 1
fi

backup="${ENV_FILE}.bak.ports-$(date +%Y%m%d-%H%M%S)"
if [ "$DRY" -eq 0 ]; then
  cp "$ENV_FILE" "$backup"
  echo "📋 Sauvegarde : $backup"
fi

apply_kv() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [ "$DRY" -eq 1 ]; then
      echo "  ${key}=${val}"
    else
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    fi
  else
    if [ "$DRY" -eq 1 ]; then
      echo "  + ${key}=${val}"
    else
      # Insérer après le bloc ports commenté si présent
      if grep -q '# === Ports hôte' "$ENV_FILE"; then
        sed -i "/# === Ports hôte/a ${key}=${val}" "$ENV_FILE"
      else
        echo "${key}=${val}" >> "$ENV_FILE"
      fi
    fi
  fi
}

echo "🔧 Série séquentielle (PORT-ORG-01) :"
for key in PORT_DASHBOARD PORT_GATEWAY PORT_AUTH PORT_ADMIN \
  PORT_MAIL_DIRECTORY PORT_PASS_MGR PORT_CALENDAR PORT_NOTES PORT_TASKS \
  PORT_DRIVE PORT_CONTACTS PORT_PHOTOS PORT_POSTGRES PORT_REDIS \
  PORT_ADMINER PORT_REDIS_COMMANDER; do
  apply_kv "$key" "${!key}"
done

# Remplacer anciens ports gateway (6080) par PORT_GATEWAY dans les URLs connues
replace_url_port() {
  local var="$1"
  local line
  line="$(grep -E "^${var}=" "$ENV_FILE" 2>/dev/null || true)"
  [ -z "$line" ] && return 0
  local new_line
  new_line="$(echo "$line" | sed -E \
    -e "s|:6080|:${PORT_GATEWAY}|g" \
    -e "s|:6050|:${PORT_MAIL_DIRECTORY}|g")"
  if [ "$line" != "$new_line" ]; then
    if [ "$DRY" -eq 1 ]; then
      echo "  ${new_line}"
    else
      sed -i "s|^${var}=.*|${new_line}|" "$ENV_FILE"
    fi
  fi
}

replace_url_port VITE_API_URL
replace_url_port CLOUDITY_MOBILE_GATEWAY_URL
replace_url_port GOOGLE_OAUTH_REDIRECT_URI

if [ "$DRY" -eq 1 ]; then
  echo ""
  echo "ℹ️  Mode dry-run — aucune modification."
else
  echo ""
  echo "✅ .env mis à jour. Relancer : make down && make up"
  echo "   Vérifier : make check-ports && make status"
fi
