#!/usr/bin/env bash
# Démarre l'app web en HTTPS local via mkcert + Vite (sans Docker).
#
# Usage : ./scripts/dev/dev-https.sh
#
# Prérequis :
#   - Node 20+ et npm (ou pnpm) sur la machine
#   - mkcert installé (https://github.com/FiloSottile/mkcert)
#   - Stack backend déjà lancée (make up) sur http://localhost:6080
#
# Ce script :
#   1. génère un certificat local mkcert pour localhost / 127.0.0.1 ;
#   2. lance Vite avec --https + --host (pour le LAN) ;
#   3. expose l'app sur https://localhost:5173 (port Vite par défaut hors Docker).
#
# Cf. docs/securite/REVERSE-PROXY.md (HTTPS prod) et docs/operations/DEV-VERIFICATION.md.

set -euo pipefail

if ! command -v mkcert >/dev/null 2>&1; then
  echo "❌ mkcert manquant. Installe-le (Arch : sudo pacman -S mkcert) puis relance." >&2
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CERT_DIR="${ROOT_DIR}/.certs"
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

if [ ! -f "$CERT_DIR/localhost.pem" ] || [ ! -f "$CERT_DIR/localhost-key.pem" ]; then
  echo "🔐 Génération du certificat mkcert (localhost + 127.0.0.1)…"
  mkcert -install >/dev/null
  (cd "$CERT_DIR" && mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 cloudity.localhost ::1)
fi

export VITE_HTTPS_KEY="$CERT_DIR/localhost-key.pem"
export VITE_HTTPS_CERT="$CERT_DIR/localhost.pem"
export VITE_API_URL="${VITE_API_URL:-https://localhost:6080}"

cd "$ROOT_DIR/frontend/apps/cloudity-web"
echo "🚀 Démarrage Vite en HTTPS sur https://localhost:5173 (proxy /admin/*, /auth/*, …)"
echo "   API attendue : $VITE_API_URL (terminer TLS côté reverse-proxy en prod ; mkcert ici suffit pour le dev)."
exec npx vite --https --host
