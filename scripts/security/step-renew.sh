#!/bin/sh
# step-renew.sh — sidecar de rotation de cert pour les services Cloudity
# (cf. docs/MTLS-INTERNE.md § 3.4 et 4).
#
# Usage typique en init container ou sidecar Docker :
#
#   STEP_CA_URL=https://step-ca:9000 \
#   STEP_CA_FINGERPRINT=$(cat /run/step/ca-fingerprint) \
#   SVC_NAME=password-manager \
#   SPIFFE_ID=spiffe://cloudity.local/ns/default/sa/password-manager \
#   CERT_DIR=/run/step/password-manager \
#   CERT_TTL=24h \
#   RENEW_AT=8h \
#   /scripts/security/step-renew.sh
#
# Comportement :
#   - démarre sans cert : appelle `step ca certificate` une fois (bootstrap),
#   - puis tourne en boucle `step ca renew --force --expires-in $RENEW_AT`,
#   - écrit dans $CERT_DIR/{cert.pem,key.pem} et $CERT_DIR/ca.pem,
#   - sort en erreur si trop d'échecs consécutifs (CA injoignable plus de 5 min).
#
# Conventions Cloudity :
#   - les fichiers vont sur tmpfs (`docker tmpfs:` ou `--mount type=tmpfs`)
#     pour ne JAMAIS persister la clé privée sur disque hôte.
#   - le binaire `step` doit être présent dans l'image (smallstep/step-ca,
#     smallstep/step-cli, ou alpine + `apk add step-cli`).

set -eu

: "${STEP_CA_URL:?STEP_CA_URL required (ex. https://step-ca:9000)}"
: "${STEP_CA_FINGERPRINT:?STEP_CA_FINGERPRINT required (root_ca.crt fingerprint)}"
: "${SVC_NAME:?SVC_NAME required}"
: "${SPIFFE_ID:?SPIFFE_ID required (ex. spiffe://cloudity.local/ns/default/sa/<svc>)}"
: "${CERT_DIR:=/run/step/${SVC_NAME}}"
: "${CERT_TTL:=24h}"
: "${RENEW_AT:=8h}"
: "${PROVISIONER:=cloudity-jwt}"
: "${PROVISIONER_PASSWORD_FILE:=/secrets/provisioner-password}"
: "${RENEW_INTERVAL:=300}"   # 5 min entre deux tentatives renew
: "${MAX_FAILURES:=10}"      # ~50 min de tolérance avant exit

mkdir -p "$CERT_DIR"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
CA="$CERT_DIR/ca.pem"

# Bootstrap : récupérer la racine + un cert frais.
if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
    echo "[step-renew] bootstrap pour $SVC_NAME (CA=$STEP_CA_URL)"
    step ca bootstrap \
        --ca-url "$STEP_CA_URL" \
        --fingerprint "$STEP_CA_FINGERPRINT" \
        --force >/dev/null
    cp -f "$(step path)/certs/root_ca.crt" "$CA"

    set --
    if [ -f "$PROVISIONER_PASSWORD_FILE" ]; then
        set -- --provisioner-password-file "$PROVISIONER_PASSWORD_FILE"
    fi

    # On émet un cert avec URI SAN SPIFFE (pour internalsec.RequireServiceCallerHTTP).
    step ca certificate "$SVC_NAME" "$CERT" "$KEY" \
        --provisioner "$PROVISIONER" \
        --san "$SPIFFE_ID" \
        --san "$SVC_NAME" \
        --san "$SVC_NAME.cloudity.local" \
        --not-after "$CERT_TTL" \
        --kty EC --curve P-256 \
        --force \
        "$@"
    echo "[step-renew] cert émis -> $CERT"
fi

failures=0
echo "[step-renew] boucle renew toutes les ${RENEW_INTERVAL}s (renew quand expire-in < ${RENEW_AT})"
while :; do
    if step ca renew "$CERT" "$KEY" \
        --force \
        --expires-in "$RENEW_AT" \
        >/tmp/step-renew.log 2>&1; then
        failures=0
    else
        failures=$((failures + 1))
        echo "[step-renew] WARN renew failed ($failures/$MAX_FAILURES) :"
        sed -n '1,5p' /tmp/step-renew.log >&2 || true
        if [ "$failures" -ge "$MAX_FAILURES" ]; then
            echo "[step-renew] FATAL : trop d'échecs consécutifs, abandon"
            exit 1
        fi
    fi
    sleep "$RENEW_INTERVAL"
done
