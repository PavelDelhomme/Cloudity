#!/usr/bin/env bash
# Certificats mkcert pour Vite en Docker (https://localhost:6001, https://cloudity.localhost:6001).
# Usage : ./scripts/dev/mkcert-docker-certs.sh
# Puis : docker compose up -d cloudity-web  (Vite lit /ws/.certs dans le conteneur)

set -euo pipefail

if ! command -v mkcert >/dev/null 2>&1; then
  echo "❌ mkcert manquant (Arch : sudo pacman -S mkcert)" >&2
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CERT_DIR="${ROOT_DIR}/.certs"
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

echo "🔐 mkcert : localhost, 127.0.0.1, cloudity.localhost, ::1"
mkcert -install >/dev/null 2>&1 || true
(cd "$CERT_DIR" && mkcert -key-file localhost-key.pem -cert-file localhost.pem \
  localhost 127.0.0.1 cloudity.localhost ::1)

echo "✅ Certificats : $CERT_DIR/localhost.pem"
echo "   Ouvrir : https://localhost:6001 ou https://cloudity.localhost:6001"
echo "   (API gateway reste en HTTP sur :6080 — CORS_ALLOW_LAN couvre *.localhost)"
