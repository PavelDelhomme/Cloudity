#!/bin/sh
# Entrypoint admin-service. Active TLS si MTLS_MODE != off.
#
# Variables :
#   MTLS_MODE       : off (défaut, HTTP plain) | permissive | strict
#   MTLS_CERT_FILE  : chemin du cert serveur (défaut /run/step/cert.pem)
#   MTLS_KEY_FILE   : chemin de la clé serveur (défaut /run/step/key.pem)
#   MTLS_CA_FILE    : chemin de la CA pour valider les clients (défaut /run/step/ca.pem)
#   PORT            : port d'écoute (défaut 8082)
#
# Voir docs/securite/MTLS-INTERNE.md et docs/securite/AUDIT-SECURITE.md § 6 bis.

set -eu

MODE="${MTLS_MODE:-off}"
PORT="${PORT:-8082}"
CERT_FILE="${MTLS_CERT_FILE:-/run/step/cert.pem}"
KEY_FILE="${MTLS_KEY_FILE:-/run/step/key.pem}"
CA_FILE="${MTLS_CA_FILE:-/run/step/ca.pem}"

case "${MODE}" in
  permissive|strict)
    if [ ! -f "${CERT_FILE}" ] || [ ! -f "${KEY_FILE}" ] || [ ! -f "${CA_FILE}" ]; then
      echo "[admin-service] MTLS_MODE=${MODE} mais cert/key/ca manquants (${CERT_FILE}, ${KEY_FILE}, ${CA_FILE})." >&2
      exit 1
    fi
    # uvicorn: --ssl-cert-reqs prend un entier (ssl.VerifyMode).
    #   0 = CERT_NONE, 1 = CERT_OPTIONAL, 2 = CERT_REQUIRED.
    SSL_REQ="1"
    if [ "${MODE}" = "strict" ]; then
      SSL_REQ="2"
    fi
    echo "[admin-service] uvicorn TLS (mode=${MODE}, ssl_cert_reqs=${SSL_REQ})"
    exec uvicorn app.main:app \
      --host 0.0.0.0 --port "${PORT}" \
      --ssl-keyfile "${KEY_FILE}" \
      --ssl-certfile "${CERT_FILE}" \
      --ssl-ca-certs "${CA_FILE}" \
      --ssl-cert-reqs "${SSL_REQ}" \
      "$@"
    ;;
  *)
    echo "[admin-service] uvicorn HTTP plain (MTLS_MODE=${MODE})"
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" "$@"
    ;;
esac
