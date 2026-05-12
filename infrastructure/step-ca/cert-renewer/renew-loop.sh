#!/bin/sh
# Cloudity — sidecar de rotation des certs mTLS internes.
#
# Boucle infinie qui passe sur tous les sous-dossiers de
# /certs/issued (chacun contenant cert.pem + key.pem + ca.pem) et lance
# `step ca renew` quand la durée restante du cert tombe sous le seuil.
#
# Variables :
#   STEP_CA_URL          URL de la CA interne (def. https://step-ca:9000)
#   CERT_RENEW_INTERVAL  Secondes entre chaque passage (def. 600 = 10 min)
#   CERT_EXPIRES_IN      Seuil de renew par cert (def. 6h — renew si reste ≤ 6h)
#
# Pré-requis :
#   - L'image embarque le binaire `step` (smallstep/step-ca:latest l'inclut).
#   - /certs/issued est un bind-mount vers infrastructure/step-ca/issued/.
#   - Chaque <svc>/cert.pem doit déjà être émis (cf. `make mtls-poc`,
#     `make mtls-issue NAME=<svc>`). Le sidecar ne **bootstrape jamais** —
#     il ne fait que rotation, pour éviter d'embarquer un mot de passe CA.
#
# Voir docs/securite/MTLS-INTERNE.md § Rotation et docs/securite/AUDIT-SECURITE.md.

set -eu

CA_URL="${STEP_CA_URL:-https://step-ca:9000}"
INTERVAL="${CERT_RENEW_INTERVAL:-600}"
EXPIRES_IN="${CERT_EXPIRES_IN:-6h}"
CERT_ROOT="${CERT_ROOT:-/certs/issued}"

log() {
  printf '[%s] cert-renewer: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

renew_one() {
  dir="$1"
  name="$(basename "$dir")"
  cert="$dir/cert.pem"
  key="$dir/key.pem"
  ca="$dir/ca.pem"

  if [ ! -f "$cert" ] || [ ! -f "$key" ] || [ ! -f "$ca" ]; then
    return 0
  fi

  if step ca renew "$cert" "$key" \
       --ca-url "$CA_URL" \
       --root  "$ca" \
       --expires-in "$EXPIRES_IN" \
       --force \
       >/tmp/renew.log 2>&1; then
    if grep -q -E 'not renewed|has not expired' /tmp/renew.log; then
      msg=$(awk '/not renewed|has not expired/{print; exit}' /tmp/renew.log)
      log "[$name] OK ($msg)"
    else
      log "[$name] ✅ renouvelé"
    fi
  else
    log "[$name] ❌ renew échoué :"
    sed 's/^/  /' /tmp/renew.log
  fi
}

log "démarrage — CA=$CA_URL, intervalle=${INTERVAL}s, seuil=${EXPIRES_IN}, racine=$CERT_ROOT"

while :; do
  if [ -d "$CERT_ROOT" ]; then
    for d in "$CERT_ROOT"/*/; do
      [ -d "$d" ] || continue
      renew_one "$d"
    done
  else
    log "ATTENTION : $CERT_ROOT introuvable — bind-mount manquant ?"
  fi
  sleep "$INTERVAL"
done
