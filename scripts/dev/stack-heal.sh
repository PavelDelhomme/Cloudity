#!/usr/bin/env bash
# Réparation « tout-en-un » de l’environnement dev local le plus souvent cassé :
#   1) MAIL_PASSWORD_ENCRYPTION_KEY dans .env (sync IMAP / decrypt boîtes)
#   2) ALIAS_ENCRYPTION_KEY et MTA_INTERNAL_TOKEN si absents
#   3) Recréation de mail-directory-service pour relire le .env
#   4) Build de l’extension Pass MV3 (dist/)
#
# Usage : ./scripts/dev/stack-heal.sh
#         make stack-heal   (depuis la racine du dépôt)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_BIN="${COMPOSE_BIN:-docker compose}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ -f scripts/dev/ensure-mail-encryption-key.sh ]; then
  chmod +x scripts/dev/ensure-mail-encryption-key.sh 2>/dev/null || true
  echo "🔑 Vérification MAIL_PASSWORD_ENCRYPTION_KEY…"
  ./scripts/dev/ensure-mail-encryption-key.sh
else
  echo "⚠️  scripts/dev/ensure-mail-encryption-key.sh introuvable."
fi

if [ -f scripts/dev/ensure-alias-encryption-key.sh ]; then
  chmod +x scripts/dev/ensure-alias-encryption-key.sh 2>/dev/null || true
  echo "🔑 Vérification ALIAS_ENCRYPTION_KEY…"
  ./scripts/dev/ensure-alias-encryption-key.sh
fi

if [ -f scripts/dev/ensure-mta-internal-token.sh ]; then
  chmod +x scripts/dev/ensure-mta-internal-token.sh 2>/dev/null || true
  echo "🔑 Vérification MTA_INTERNAL_TOKEN…"
  ./scripts/dev/ensure-mta-internal-token.sh
fi

if docker info >/dev/null 2>&1; then
  echo "♻️  Recréation de mail-directory-service (rechargement des variables d’environnement depuis .env)…"
  $COMPOSE_BIN -f "$COMPOSE_FILE" up -d --force-recreate --no-deps mail-directory-service
else
  echo "⚠️  Docker indisponible — impossible de recréer les conteneurs."
  echo "    Après démarrage de Docker :  docker compose -f $COMPOSE_FILE up -d --force-recreate --no-deps mail-directory-service"
fi

if command -v npm >/dev/null 2>&1; then
  echo "🔌 Build extension Cloudity Pass…"
  (cd extensions/cloudity-pass && npm install --no-audit --fund=false && npm run build)
  echo "✅ Extension → extensions/cloudity-pass/dist"
else
  echo "⚠️  npm absent — installe Node.js puis : make build-pass-extension"
fi

echo ""
echo "✅ Réparation dev terminée (make doctor / make stack-heal)."
echo "   Rien d’« erreur » ci-dessus si tu vois uniquement des ✅ : la clé mail est OK, le conteneur mail a été recréé, l’extension Pass est buildée."
echo "   Pour le MTA alias local : MAIL_ALIAS_DOMAIN suffit en dev ; MAIL_ALIAS_SUBDOMAIN reste le nom canonique côté backend/Portainer."
echo "   Si POST …/mail/me/accounts/<id>/sync échoue encore : ouvre la boîte dans Mail, ré-enregistre le mot de passe IMAP, puis resynchronise."
echo "   Avertissement « dossier icons/ manquant » : bénin (icônes MV3 optionnelles)."
echo "   Rebuild complet des images : make rebuild (auth/api-gateway + internalsec)."
