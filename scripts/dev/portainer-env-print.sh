#!/usr/bin/env bash
# Affiche un .env.prod / .env.preprod prêt à coller dans Portainer (sans commentaires).
#
# Usage :
#   ./scripts/dev/portainer-env-print.sh
#   ./scripts/dev/portainer-env-print.sh .env.preprod
#   FILE=.env.prod ./scripts/dev/portainer-env-print.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="${1:-${FILE:-$ROOT/.env.prod}}"
if [[ "$FILE" != /* ]]; then
  FILE="$ROOT/$FILE"
fi

if [ ! -f "$FILE" ]; then
  echo "❌ $FILE introuvable. Génère-le d'abord :" >&2
  echo "   make env-prod DOMAIN=cloudity.ton-domaine.tld" >&2
  exit 1
fi

echo "# --- Coller dans Portainer (Advanced env) — source: $FILE ---" >&2
awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=/ { print }
' "$FILE"
echo "# --- fin ($FILE) ---" >&2
echo "✅ Variables affichées sur stdout — copie dans Portainer." >&2
echo "   Compose path prod : deploy/portainer/docker-compose.stack.yml" >&2
echo "   Doc : deploy/portainer/PORTAINER-STACK.md" >&2
