#!/bin/sh
# Init container Postgres : copie les certs step-ca dans /var/lib/postgresql/tls
# avec le bon propriétaire (postgres) et chmod 600 — exigé par PostgreSQL
# (refus de démarrer si la clé est lisible group/world).
#
# Lancé par /docker-entrypoint-initdb.d/0-tls-init.sh côté image officielle.
# Voir docker-compose.https.yml et docs/securite/MTLS-INTERNE.md.

set -eu

SRC=/run/step
DST=/var/lib/postgresql/tls

if [ ! -f "${SRC}/cert.pem" ] || [ ! -f "${SRC}/key.pem" ] || [ ! -f "${SRC}/ca.pem" ]; then
  echo "[tls-init] /run/step/{cert,key,ca}.pem manquant — émettre via 'make mtls-issue-postgres'."
  exit 1
fi

mkdir -p "${DST}"
cp "${SRC}/cert.pem" "${DST}/cert.pem"
cp "${SRC}/key.pem"  "${DST}/key.pem"
cp "${SRC}/ca.pem"   "${DST}/ca.pem"
chown -R postgres:postgres "${DST}"
chmod 600 "${DST}/key.pem"
chmod 644 "${DST}/cert.pem" "${DST}/ca.pem"
echo "[tls-init] certs Postgres prêts dans ${DST}."
