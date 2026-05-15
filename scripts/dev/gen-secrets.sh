#!/usr/bin/env bash
# Génère un .env local (ou .env.production.example) avec des secrets robustes.
#
# Usage :
#   ./scripts/dev/gen-secrets.sh                # crée .env si absent
#   ./scripts/dev/gen-secrets.sh --force        # écrase .env existant
#   ./scripts/dev/gen-secrets.sh --print        # affiche les valeurs sans écrire
#   OUTPUT=.env.production.example ./scripts/dev/gen-secrets.sh
#
# Variables générées :
#   POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET, PERFORMANCE_INGEST_TOKEN,
#   MAIL_PASSWORD_ENCRYPTION_KEY (IMAP/SMTP chiffrés côté mail-directory-service),
#   ALIAS_ENCRYPTION_KEY (32 octets base64 — parité prod / futurs champs alias)
#
# Conformité : docs/securite/CRYPTO-NORME.md, docs/securite/AUDIT-SECURITE.md.

set -euo pipefail

OUTPUT="${OUTPUT:-.env}"
FORCE=0
PRINT_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --print) PRINT_ONLY=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "argument inconnu : $arg" >&2
      exit 2
      ;;
  esac
done

rand_hex() {
  # 32 octets = 256 bits aléatoires (CSPRNG)
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 64 /dev/urandom | xxd -p -c 64
  fi
}

rand_b64_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64 -w0 2>/dev/null || head -c 32 /dev/urandom | base64
  fi
}

POSTGRES_PASSWORD="$(rand_hex)"
REDIS_PASSWORD="$(rand_hex)"
JWT_SECRET="$(rand_hex)"
PERFORMANCE_INGEST_TOKEN="$(rand_hex)"
MAIL_PASSWORD_ENCRYPTION_KEY="$(rand_hex)"
ALIAS_ENCRYPTION_KEY="$(rand_b64_32)"

if [ "$PRINT_ONLY" = "1" ]; then
  cat <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}
PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}

# 32 octets hex (64 car.) — obligatoire pour déchiffrer les mots de passe boîtes (POST /mail/me/accounts/:id/sync).
MAIL_PASSWORD_ENCRYPTION_KEY=${MAIL_PASSWORD_ENCRYPTION_KEY}

# 32 octets aléatoires (base64) — stack VPS / futurs champs sensibles alias (voir SECRETS.md).
ALIAS_ENCRYPTION_KEY=${ALIAS_ENCRYPTION_KEY}
EOF
  exit 0
fi

if [ -f "$OUTPUT" ] && [ "$FORCE" != "1" ]; then
  echo "❌  $OUTPUT existe déjà. Utilise --force pour écraser ou OUTPUT=<fichier>." >&2
  exit 1
fi

cat > "$OUTPUT" <<EOF
# Cloudity — secrets générés le $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Ne pas committer ce fichier (cf. .gitignore).
# Voir docs/securite/AUDIT-SECURITE.md, docs/securite/CRYPTO-NORME.md.

POSTGRES_USER=cloudity_admin
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=cloudity

REDIS_PASSWORD=${REDIS_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# OBLIGATOIRE prod : sans valeur, POST /admin/performance/pipeline-run renvoie 503.
PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}

# CORS — durcir en prod (liste explicite, désactiver CORS_ALLOW_LAN).
CORS_ORIGINS=http://localhost:6001,http://localhost:5173
CORS_ALLOW_LAN=true

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Chiffrement des mots de passe IMAP/SMTP (user_email_accounts) — 32 octets hex (64 car.).
MAIL_PASSWORD_ENCRYPTION_KEY=${MAIL_PASSWORD_ENCRYPTION_KEY}

# Alias / champs sensibles (parité DEPLOIEMENT-VPS) — 32 octets CSPRNG en base64.
ALIAS_ENCRYPTION_KEY=${ALIAS_ENCRYPTION_KEY}
EOF

chmod 600 "$OUTPUT"
echo "✅ Secrets écrits dans $OUTPUT (chmod 600)."
echo "   Ajoute le contenu manquant (ex. GOOGLE_OAUTH_*) si nécessaire."
