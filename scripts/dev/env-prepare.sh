#!/usr/bin/env bash
# Prépare un fichier d'environnement ciblé (préprod / prod) pour Portainer.
#
# Fusionne :
#   1. .env.example  → schéma de clés + commentaires de référence
#   2. .env          → secrets et valeurs déjà renseignées en local
#   3. overlays      → GO_ENV/NODE_ENV, CORS_ALLOW_LAN=false, LOG_LEVEL, etc.
#
# Puis (sauf --no-sync) lance sync-public-urls sur le fichier cible.
#
# Usage :
#   ./scripts/dev/env-prepare.sh prod
#   ./scripts/dev/env-prepare.sh preprod
#   ./scripts/dev/env-prepare.sh prod --domain cloudity.example
#   ./scripts/dev/env-prepare.sh prod --host cloudity.example --api-host api.cloudity.example
#   ./scripts/dev/env-prepare.sh prod --force          # écrase .env.prod existant
#   ./scripts/dev/env-prepare.sh prod --no-sync        # n'appelle pas sync-public-urls
#   ./scripts/dev/env-prepare.sh prod --print          # stdout seulement (Portainer paste)
#
# Makefile :
#   make env-prod DOMAIN=cloudity.example
#   make env-preprod DOMAIN=preprod.cloudity.example
#   make portainer-env          # affiche .env.prod sans commentaires
#
# Doc : docs/operations/ENV-GENERATION.md · deploy/portainer/PORTAINER-STACK.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXAMPLE="${ENV_EXAMPLE:-$ROOT/.env.example}"
SOURCE_ENV="${ENV_SOURCE:-$ROOT/.env}"
MODE=""
DOMAIN=""
HOST_OVERRIDE=""
API_HOST_OVERRIDE=""
WEB_HOST_OVERRIDE=""
FORCE=0
NO_SYNC=0
PRINT_ONLY=0
OUT_FILE=""

usage() {
  sed -n '2,28p' "$0"
}

while [ $# -gt 0 ]; do
  case "$1" in
    prod|preprod|dev)
      MODE="$1"
      shift
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --host)
      HOST_OVERRIDE="${2:-}"
      shift 2
      ;;
    --api-host)
      API_HOST_OVERRIDE="${2:-}"
      shift 2
      ;;
    --web-host)
      WEB_HOST_OVERRIDE="${2:-}"
      shift 2
      ;;
    --force|-f)
      FORCE=1
      shift
      ;;
    --no-sync)
      NO_SYNC=1
      shift
      ;;
    --print)
      PRINT_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "argument inconnu : $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "❌ Mode requis : prod | preprod | dev" >&2
  usage >&2
  exit 2
fi

case "$MODE" in
  prod) OUT_FILE="${ENV_OUT:-$ROOT/.env.prod}" ;;
  preprod) OUT_FILE="${ENV_OUT:-$ROOT/.env.preprod}" ;;
  dev) OUT_FILE="${ENV_OUT:-$ROOT/.env}" ;;
esac

if [ ! -f "$EXAMPLE" ]; then
  echo "❌ $EXAMPLE introuvable." >&2
  exit 1
fi

# --- helpers ---------------------------------------------------------------

read_kv_file() {
  # Affiche KEY=VALUE (dernière occurrence) pour chaque clé non commentée
  local file="$1"
  [ -f "$file" ] || return 0
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=/ {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      eq=index(line, "=")
      if (eq > 0) {
        k=substr(line, 1, eq-1)
        v=substr(line, eq+1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
        # strip wrapping quotes
        if (v ~ /^".*"$/) { v=substr(v, 2, length(v)-2) }
        else if (v ~ /^'\''.*'\''$/) { v=substr(v, 2, length(v)-2) }
        vals[k]=v
        if (!(k in order)) { order[k]=++n }
      }
    }
    END {
      for (i=1; i<=n; i++) {
        for (k in order) if (order[k]==i) print k "=" vals[k]
      }
    }
  ' "$file"
}

is_placeholder() {
  local v="$1"
  case "$v" in
    ""|change_me*|REMPLACER*|dev_only*|your-*|*example.com|*example.ovh|mail@example.com)
      return 0
      ;;
  esac
  return 1
}

set_map() {
  local key="$1" val="$2"
  MERGED_KEYS+=("$key")
  MERGED_VALS["$key"]="$val"
}

# --- merge maps ------------------------------------------------------------

declare -A EXAMPLE_VALS=()
declare -A SOURCE_VALS=()
declare -A MERGED_VALS=()
declare -a MERGED_KEYS=()
declare -A SEEN=()

while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  k="${line%%=*}"
  v="${line#*=}"
  EXAMPLE_VALS["$k"]="$v"
done < <(read_kv_file "$EXAMPLE")

if [ -f "$SOURCE_ENV" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    k="${line%%=*}"
    v="${line#*=}"
    SOURCE_VALS["$k"]="$v"
  done < <(read_kv_file "$SOURCE_ENV")
else
  echo "⚠️  $SOURCE_ENV absent — fusion depuis .env.example seul (secrets à coller ensuite)." >&2
fi

# Ordre : clés example d'abord, puis clés présentes seulement dans .env
# Stable order from example file appearance
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  k="${line%%=*}"
  [ -n "${SEEN[$k]+x}" ] && continue
  SEEN["$k"]=1
  src="${SOURCE_VALS[$k]:-}"
  ex="${EXAMPLE_VALS[$k]:-}"
  if [ -n "$src" ] && ! is_placeholder "$src"; then
    set_map "$k" "$src"
  elif [ -n "$ex" ]; then
    set_map "$k" "$ex"
  else
    set_map "$k" ""
  fi
done < <(read_kv_file "$EXAMPLE")

# Clés seulement dans .env (ex. secrets custom)
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  k="${line%%=*}"
  [ -n "${SEEN[$k]+x}" ] && continue
  SEEN["$k"]=1
  set_map "$k" "${SOURCE_VALS[$k]}"
done < <(read_kv_file "$SOURCE_ENV")

# --- overlays par mode -----------------------------------------------------

apply_overlay() {
  local k="$1" v="$2"
  if [ -n "${SEEN[$k]+x}" ]; then
    MERGED_VALS["$k"]="$v"
  else
    SEEN["$k"]=1
    set_map "$k" "$v"
  fi
}

case "$MODE" in
  prod)
    apply_overlay GO_ENV production
    apply_overlay NODE_ENV production
    apply_overlay BUILD_TARGET production
    apply_overlay CORS_ALLOW_LAN false
    apply_overlay LOG_LEVEL info
    apply_overlay CLOUDITY_PUBLIC_PROTO https
    apply_overlay CLOUDITY_PUBLIC_OMIT_PORTS true
    # Ne pas réutiliser les extras LAN du .env local (localhost, IP…)
    apply_overlay CORS_ORIGINS_EXTRA ""
    apply_overlay WEBAUTHN_ORIGINS_EXTRA ""
    # Désactiver bootstrap E2E
    apply_overlay CLOUDITY_ALLOW_E2E_BOOTSTRAP ""
    ;;
  preprod)
    apply_overlay GO_ENV production
    apply_overlay NODE_ENV production
    apply_overlay BUILD_TARGET production
    apply_overlay CORS_ALLOW_LAN false
    apply_overlay LOG_LEVEL info
    apply_overlay CLOUDITY_PUBLIC_PROTO https
    apply_overlay CLOUDITY_PUBLIC_OMIT_PORTS true
    apply_overlay CORS_ORIGINS_EXTRA ""
    apply_overlay WEBAUTHN_ORIGINS_EXTRA ""
    ;;
  dev)
    apply_overlay GO_ENV development
    apply_overlay NODE_ENV development
    apply_overlay BUILD_TARGET dev
    apply_overlay CORS_ALLOW_LAN true
    apply_overlay CLOUDITY_PUBLIC_PROTO http
    ;;
esac

# Domaine / hosts
if [ -n "$DOMAIN" ]; then
  HOST_OVERRIDE="${HOST_OVERRIDE:-$DOMAIN}"
  API_HOST_OVERRIDE="${API_HOST_OVERRIDE:-api.${DOMAIN}}"
fi
if [ -n "$HOST_OVERRIDE" ]; then
  apply_overlay CLOUDITY_PUBLIC_HOST "$HOST_OVERRIDE"
fi
if [ -n "$API_HOST_OVERRIDE" ]; then
  apply_overlay CLOUDITY_PUBLIC_API_HOST "$API_HOST_OVERRIDE"
fi
if [ -n "$WEB_HOST_OVERRIDE" ]; then
  apply_overlay CLOUDITY_PUBLIC_WEB_HOST "$WEB_HOST_OVERRIDE"
fi

# Si prod/preprod sans host : garder celui du .env ou exiger --domain
PUBLIC_HOST="${MERGED_VALS[CLOUDITY_PUBLIC_HOST]:-}"
if [ "$MODE" != "dev" ] && { [ -z "$PUBLIC_HOST" ] || [ "$PUBLIC_HOST" = "localhost" ] || [[ "$PUBLIC_HOST" =~ ^[0-9]+\.[0-9]+\. ]]; }; then
  if [ -z "$HOST_OVERRIDE" ] && [ -z "$DOMAIN" ]; then
    echo "⚠️  CLOUDITY_PUBLIC_HOST est encore local/LAN ($PUBLIC_HOST)." >&2
    echo "   Relance avec : $0 $MODE --domain cloudity.ton-domaine.tld" >&2
    echo "   (fichier écrit quand même — tu pourras corriger puis make sync-public-urls ENV_FILE=$OUT_FILE)" >&2
  fi
fi

# --- write / print ---------------------------------------------------------

render_body() {
  local k
  echo "# Cloudity — environnement $MODE généré le $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Source : fusion .env.example + .env + overlays $MODE"
  echo "# Ne pas committer. Portainer : coller les KEY=VALUE (make portainer-env)."
  echo "# Après édition HOST/PROTO : ENV_FILE=$OUT_FILE make sync-public-urls"
  echo "#"
  for k in "${MERGED_KEYS[@]}"; do
    # Ne pas écrire les clés bootstrap E2E vides en prod
    if [ "$k" = "CLOUDITY_ALLOW_E2E_BOOTSTRAP" ] && [ -z "${MERGED_VALS[$k]}" ]; then
      continue
    fi
    if [ "$k" = "E2E_BOOTSTRAP_SECRET" ] && [ "$MODE" != "dev" ]; then
      continue
    fi
    printf '%s=%s\n' "$k" "${MERGED_VALS[$k]}"
  done
}

if [ "$PRINT_ONLY" = "1" ]; then
  render_body
  exit 0
fi

if [ -f "$OUT_FILE" ] && [ "$FORCE" != "1" ] && [ "$MODE" != "dev" ]; then
  echo "❌ $OUT_FILE existe déjà. Utilise --force pour écraser, ou édite-le puis :" >&2
  echo "   ENV_FILE=$OUT_FILE make sync-public-urls" >&2
  exit 1
fi

if [ "$MODE" = "dev" ] && [ "$OUT_FILE" = "$ROOT/.env" ] && [ -f "$OUT_FILE" ] && [ "$FORCE" != "1" ]; then
  echo "❌ Refus d'écraser .env sans --force (mode dev). Préfère make env-prod / env-preprod." >&2
  exit 1
fi

render_body >"$OUT_FILE"
chmod 600 "$OUT_FILE"
echo "✅ Écrit $OUT_FILE (mode=$MODE, chmod 600)."

if [ "$NO_SYNC" = "1" ]; then
  echo "   (--no-sync) sync-public-urls non lancé."
  exit 0
fi

if [ -z "${MERGED_VALS[CLOUDITY_PUBLIC_HOST]:-}" ]; then
  echo "⚠️  CLOUDITY_PUBLIC_HOST vide — sync URL sauté. Renseigne le host puis :"
  echo "   ENV_FILE=$OUT_FILE make sync-public-urls"
  exit 0
fi

echo "🔗 Synchronisation des URLs publiques…"
ENV_FILE="$OUT_FILE" "$ROOT/scripts/dev/sync-public-urls.sh"
echo ""
echo "📋 Suite Portainer :"
echo "   1. make portainer-env          # (ou make portainer-env FILE=$OUT_FILE)"
echo "   2. Coller dans Portainer → Stack → Environment variables (Advanced)"
echo "   3. Guide : deploy/portainer/PORTAINER-STACK.md"
