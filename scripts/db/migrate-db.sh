#!/bin/sh
# Applique les migrations PostgreSQL non encore appliquées.
# Utilisé par le service db-migrate au démarrage de la stack.
set -e

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-cloudity_admin}"
PGPASSWORD="${POSTGRES_PASSWORD:-cloudity_secure_password_2025}"
PGDATABASE="${POSTGRES_DB:-cloudity}"
export PGPASSWORD

echo "[migrate] Connexion à $PGHOST:$PGPORT/$PGDATABASE..."

if [ ! -d /migrations ]; then
  echo "[migrate] ERREUR: /migrations absent — bind mount cassé."
  echo "[migrate] Portainer : Compose path = docker-compose.ghcr.yml (racine du dépôt, pas deploy/portainer/...)."
  exit 1
fi
if ! ls /migrations/*.sql >/dev/null 2>&1; then
  echo "[migrate] ERREUR: aucun fichier .sql dans /migrations (mount vide ou mauvais compose path)."
  ls -la /migrations /scripts 2>&1 || true
  exit 1
fi

attempt=0
max_attempts=30
until psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[migrate] ERREUR: PostgreSQL injoignable après ${max_attempts}s ($PGHOST:$PGPORT)."
    exit 1
  fi
  echo "[migrate] PostgreSQL indisponible, nouvel essai dans 1s ($attempt/$max_attempts)..."
  sleep 1
done

# Créer la table de suivi des migrations si besoin
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
" 2>/dev/null || true

# Tables users/tenants viennent de infrastructure/postgresql/init (monté sur postgres).
if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.users');" 2>/dev/null | grep -q users; then
  echo "[migrate] ERREUR: table users absente — le volume postgres a été créé SANS init/."
  echo "[migrate] Fix: supprimer le volume cloudity_postgres_data, Compose path = docker-compose.ghcr.yml à la racine."
  exit 1
fi

# Appliquer chaque fichier .sql du dossier migrations (ordre alphabétique)
for f in $(ls -1 /migrations/*.sql 2>/dev/null | sort); do
  version="$(basename "$f")"
  if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A -v ON_ERROR_STOP=1 -c "SELECT 1 FROM schema_migrations WHERE version = '$version' LIMIT 1;" 2>/dev/null | grep -q 1; then
    echo "[migrate] Déjà appliqué: $version"
    continue
  fi
  echo "[migrate] Application: $version"
  if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$f"; then
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
    echo "[migrate] OK: $version"
  else
    echo "[migrate] ERREUR lors de l'application de $version"
    exit 1
  fi
done

echo "[migrate] Terminé."
exit 0
