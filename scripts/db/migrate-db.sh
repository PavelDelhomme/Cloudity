#!/bin/sh
# Applique le schéma de base (init/) puis les migrations incrémentales.
# Utilisé par le service db-migrate (image GHCR ou mounts locaux).
set -e

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-cloudity_admin}"
PGPASSWORD="${POSTGRES_PASSWORD:-cloudity_secure_password_2025}"
PGDATABASE="${POSTGRES_DB:-cloudity}"
export PGPASSWORD

INIT_DIR="${INIT_DIR:-/init}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

echo "[migrate] Connexion à $PGHOST:$PGPORT/$PGDATABASE..."

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

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
" >/dev/null

apply_sql_file() {
  version="$1"
  f="$2"
  if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A -v ON_ERROR_STOP=1 \
    -c "SELECT 1 FROM schema_migrations WHERE version = '$version' LIMIT 1;" 2>/dev/null | grep -q 1; then
    echo "[migrate] Déjà appliqué: $version"
    return 0
  fi
  echo "[migrate] Application: $version"
  if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$f"; then
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO schema_migrations (version) VALUES ('$version');" >/dev/null
    echo "[migrate] OK: $version"
  else
    echo "[migrate] ERREUR lors de l'application de $version"
    exit 1
  fi
}

# 1) Schéma de base (users, tenants…) — prefix init: pour ne pas collisionner avec migrations/
if [ -d "$INIT_DIR" ] && ls "$INIT_DIR"/*.sql >/dev/null 2>&1; then
  for f in $(ls -1 "$INIT_DIR"/*.sql | sort); do
    apply_sql_file "init:$(basename "$f")" "$f"
  done
else
  echo "[migrate] WARN: $INIT_DIR sans .sql — espère une base déjà initialisée"
fi

# 2) Migrations incrémentales
if [ ! -d "$MIGRATIONS_DIR" ] || ! ls "$MIGRATIONS_DIR"/*.sql >/dev/null 2>&1; then
  echo "[migrate] ERREUR: aucun .sql dans $MIGRATIONS_DIR"
  echo "[migrate] Sur Portainer, utilise l'image cloudity-db-migrate (pas de bind mount hôte)."
  ls -la "$MIGRATIONS_DIR" "$INIT_DIR" 2>&1 || true
  exit 1
fi

for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql | sort); do
  apply_sql_file "$(basename "$f")" "$f"
done

echo "[migrate] Terminé."
exit 0
