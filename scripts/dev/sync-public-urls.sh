#!/usr/bin/env bash
# Aligne les URLs publiques dérivées depuis CLOUDITY_PUBLIC_* (une seule source de vérité).
#
# Usage :
#   ./scripts/dev/sync-public-urls.sh           # écrit dans .env
#   ./scripts/dev/sync-public-urls.sh --dry-run # affiche sans écrire
#   ./scripts/dev/sync-public-urls.sh --print   # alias de --dry-run
#
# Variables lues (racine .env) :
#   CLOUDITY_PUBLIC_HOST       (requis, ex. localhost | 192.168.1.134 | cloudity.example)
#   CLOUDITY_PUBLIC_PROTO      (défaut http ; prod https)
#   CLOUDITY_PUBLIC_API_HOST   (optionnel — host API distinct, ex. api.cloudity.example)
#   CLOUDITY_PUBLIC_WEB_HOST   (optionnel — host web distinct)
#   CLOUDITY_PUBLIC_OMIT_PORTS (true|1 — URLs sans :port, typique HTTPS derrière NPM)
#   PORT_DASHBOARD / PORT_GATEWAY
#   CORS_ORIGINS_EXTRA         (origines toujours fusionnées dans CORS_ORIGINS)
#   WEBAUTHN_ORIGINS_EXTRA     (idem pour WebAuthn)
#
# Variables écrites :
#   VITE_API_URL, CLOUDITY_MOBILE_GATEWAY_URL,
#   CORS_ORIGINS, WEBAUTHN_RP_ID, WEBAUTHN_ORIGINS,
#   GOOGLE_OAUTH_REDIRECT_URI, MAIL_OAUTH_FRONTEND_URL (si déjà présentes / décommentées)
#
# Doc : docs/operations/ENV-GENERATION.md § hôte public
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|--print) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *)
      echo "argument inconnu : $arg" >&2
      exit 2
      ;;
  esac
done

read_env() {
  local key="$1" default="${2:-}"
  local file="$ENV_FILE"
  [ -f "$file" ] || { printf '%s' "$default"; return 0; }
  local line val
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | tail -1 || true)"
  if [ -z "$line" ]; then
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

set_env_kv() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^[[:space:]]*${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*" k "=" && done==0 { print k "=" v; done=1; next }
      { print }
    ' "$file" >"${file}.tmp.$$" && mv "${file}.tmp.$$" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >>"$file"
  fi
}

# Décommente KEY=… si la ligne est commentée, sinon set_env_kv.
ensure_env_kv() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^[[:space:]]*${key}=" "$file" 2>/dev/null; then
    set_env_kv "$file" "$key" "$val"
  elif grep -qE "^[[:space:]]*#[[:space:]]*${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*#[[:space:]]*" k "=" && done==0 { print k "=" v; done=1; next }
      { print }
    ' "$file" >"${file}.tmp.$$" && mv "${file}.tmp.$$" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >>"$file"
  fi
}

uniq_csv() {
  # Entrée : CSV → sortie CSV sans doublons (ordre conservé)
  local IFS=,
  local -a parts=()
  local -A seen=()
  local p out=""
  # shellcheck disable=SC2206
  parts=($1)
  for p in "${parts[@]}"; do
    p="${p#"${p%%[![:space:]]*}"}"
    p="${p%"${p##*[![:space:]]}"}"
    [ -z "$p" ] && continue
    [ -n "${seen[$p]+x}" ] && continue
    seen[$p]=1
    if [ -z "$out" ]; then out="$p"; else out="$out,$p"; fi
  done
  printf '%s' "$out"
}

build_origin() {
  local proto="$1" host="$2" port="$3" omit="$4"
  if [ "$omit" = "1" ] || [ -z "$port" ]; then
    printf '%s://%s' "$proto" "$host"
  else
    printf '%s://%s:%s' "$proto" "$host" "$port"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE absent — cp .env.example .env puis renseigne CLOUDITY_PUBLIC_HOST." >&2
  exit 1
fi

HOST="$(read_env CLOUDITY_PUBLIC_HOST)"
PROTO="$(read_env CLOUDITY_PUBLIC_PROTO http)"
API_HOST="$(read_env CLOUDITY_PUBLIC_API_HOST)"
WEB_HOST="$(read_env CLOUDITY_PUBLIC_WEB_HOST)"
OMIT_RAW="$(read_env CLOUDITY_PUBLIC_OMIT_PORTS false)"
PORT_WEB="$(read_env PORT_DASHBOARD 6001)"
PORT_GW="$(read_env PORT_GATEWAY 6002)"
CORS_EXTRA="$(read_env CORS_ORIGINS_EXTRA)"
WEBAUTHN_EXTRA="$(read_env WEBAUTHN_ORIGINS_EXTRA)"

if [ -z "$HOST" ]; then
  echo "❌ CLOUDITY_PUBLIC_HOST manquant dans $ENV_FILE" >&2
  echo "   Ex. localhost | 192.168.1.134 | cloudity.example" >&2
  exit 1
fi

PROTO="$(printf '%s' "$PROTO" | tr '[:upper:]' '[:lower:]')"
case "$PROTO" in
  http|https) ;;
  *)
    echo "❌ CLOUDITY_PUBLIC_PROTO invalide ($PROTO) — http ou https." >&2
    exit 1
    ;;
esac

OMIT=0
case "$(printf '%s' "$OMIT_RAW" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on) OMIT=1 ;;
esac

# Derrière HTTPS public (NPM), ports omis par défaut si non explicitement false.
if [ "$PROTO" = "https" ] && [ -z "$(read_env CLOUDITY_PUBLIC_OMIT_PORTS)" ]; then
  OMIT=1
fi

[ -z "$WEB_HOST" ] && WEB_HOST="$HOST"
[ -z "$API_HOST" ] && API_HOST="$HOST"

WEB_URL="$(build_origin "$PROTO" "$WEB_HOST" "$PORT_WEB" "$OMIT")"
API_URL="$(build_origin "$PROTO" "$API_HOST" "$PORT_GW" "$OMIT")"

# CORS : hôte public + extras (+ filets locaux seulement en HTTP / non-omit-ports)
CORS_DEFAULT_LOCAL="http://localhost:3000,http://localhost:5173,http://localhost:6001,https://cloudity.localhost:${PORT_WEB},http://cloudity.localhost:${PORT_WEB}"
if [ -z "$CORS_EXTRA" ]; then
  if [ "$PROTO" = "https" ] || [ "$OMIT" = "1" ]; then
    CORS_EXTRA=""
  else
    CORS_EXTRA="$CORS_DEFAULT_LOCAL"
  fi
fi
CORS_ORIGINS="$(uniq_csv "${WEB_URL},${CORS_EXTRA}")"

# WebAuthn : origine web + extras (localhost:5173 pour Vite hors Docker, pas en HTTPS public)
if [ -z "$WEBAUTHN_EXTRA" ]; then
  if [ "$PROTO" = "https" ] || [ "$OMIT" = "1" ]; then
    WEBAUTHN_EXTRA=""
  else
    WEBAUTHN_EXTRA="http://localhost:6001,http://localhost:5173"
  fi
fi
WEBAUTHN_ORIGINS="$(uniq_csv "${WEB_URL},${WEBAUTHN_EXTRA}")"
# RP ID = hostname sans schéma/port. Les IP ne sont pas des RP ID WebAuthn valides → localhost.
if [[ "$WEB_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$WEB_HOST" == *:* ]]; then
  WEBAUTHN_RP_ID="localhost"
else
  WEBAUTHN_RP_ID="$WEB_HOST"
fi

OAUTH_REDIRECT="${API_URL}/mail/me/oauth/google/callback"
OAUTH_FRONT="$WEB_URL"

cat <<EOF
🔗 Hôte public → URLs dérivées
   CLOUDITY_PUBLIC_HOST=$HOST
   CLOUDITY_PUBLIC_PROTO=$PROTO
   CLOUDITY_PUBLIC_OMIT_PORTS=$OMIT
   WEB  = $WEB_URL
   API  = $API_URL
   VITE_API_URL=$API_URL
   CLOUDITY_MOBILE_GATEWAY_URL=$API_URL
   CORS_ORIGINS=$CORS_ORIGINS
   WEBAUTHN_RP_ID=$WEBAUTHN_RP_ID
   WEBAUTHN_ORIGINS=$WEBAUTHN_ORIGINS
   GOOGLE_OAUTH_REDIRECT_URI=$OAUTH_REDIRECT
   MAIL_OAUTH_FRONTEND_URL=$OAUTH_FRONT
EOF

if [ "$DRY_RUN" = "1" ]; then
  echo "(dry-run — aucune écriture)"
  exit 0
fi

set_env_kv "$ENV_FILE" VITE_API_URL "$API_URL"
set_env_kv "$ENV_FILE" CLOUDITY_MOBILE_GATEWAY_URL "$API_URL"
set_env_kv "$ENV_FILE" CORS_ORIGINS "$CORS_ORIGINS"
set_env_kv "$ENV_FILE" WEBAUTHN_RP_ID "$WEBAUTHN_RP_ID"
set_env_kv "$ENV_FILE" WEBAUTHN_ORIGINS "$WEBAUTHN_ORIGINS"
ensure_env_kv "$ENV_FILE" GOOGLE_OAUTH_REDIRECT_URI "$OAUTH_REDIRECT"
ensure_env_kv "$ENV_FILE" MAIL_OAUTH_FRONTEND_URL "$OAUTH_FRONT"

echo "✅ $ENV_FILE mis à jour. Rebuild front si VITE_* a changé : make deploy-web (ou recreate cloudity-web)."
echo "   Gateway / auth : recreate api-gateway auth-service pour CORS + WebAuthn."
