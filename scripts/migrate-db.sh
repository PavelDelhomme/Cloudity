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

# Créer la table de suivi des migrations si besoin
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
" 2>/dev/null || true

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
