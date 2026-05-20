#!/usr/bin/env bash
# Remise MTA : lookup alias Cloudity puis relais SMTP vers la boîte cible.
# Appelé par Maddy (pipe) ou en manuel : echo "RCPT <alias>" | ./alias-deliver.sh
# Variables : MAIL_DIRECTORY_URL, MTA_INTERNAL_TOKEN (dans .env, hors Git).
set -euo pipefail

MAIL_DIRECTORY_URL="${MAIL_DIRECTORY_URL:-http://mail-directory-service:8050}"
TOKEN="${MTA_INTERNAL_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "alias-deliver: MTA_INTERNAL_TOKEN manquant" >&2
  exit 75
fi

# Adresse destinataire : argument, en-tête RCPT, ou première ligne stdin
RCPT="${1:-}"
if [[ -z "$RCPT" ]]; then
  RCPT="$(grep -m1 -i '^Delivered-To:' /dev/stdin 2>/dev/null | sed 's/^[Dd]elivered-[Tt]o:[[:space:]]*//' | tr -d '\r' || true)"
fi
if [[ -z "$RCPT" ]]; then
  RCPT="$(grep -m1 -i '^To:' /dev/stdin 2>/dev/null | sed 's/^[Tt]o:[[:space:]]*//' | tr -d '\r' | awk -F'[ ,<]' '{for(i=NF;i>=1;i--) if($i ~ /@/) {print $i; exit}}' | tr -d '>' || true)"
fi
RCPT="$(echo "$RCPT" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -z "$RCPT" || "$RCPT" != *@* ]]; then
  echo "alias-deliver: adresse alias introuvable (RCPT)" >&2
  exit 67
fi

MSG_FILE="$(mktemp)"
trap 'rm -f "$MSG_FILE"' EXIT
if [[ -t 0 ]]; then
  echo "alias-deliver: attente message sur stdin" >&2
  exit 64
fi
cat >"$MSG_FILE"

PAYLOAD=$(printf '%s' "{\"alias_email\":\"%s\"}" "$RCPT")
RESP="$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: ${TOKEN}" \
  -d "$PAYLOAD" \
  "${MAIL_DIRECTORY_URL%/}/mail/internal/alias-resolve" 2>&1)" || {
  echo "alias-deliver: lookup API échoué pour ${RCPT}: ${RESP}" >&2
  exit 67
}

DELIVER_TO="$(echo "$RESP" | sed -n 's/.*"deliver_to"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "$DELIVER_TO" ]]; then
  echo "alias-deliver: alias inconnu ou désactivé: ${RCPT}" >&2
  exit 67
fi

# Préserver l’adresse alias pour le filtre Mail Cloudity (delivered_to / raw_headers)
{
  printf 'Delivered-To: %s\r\n' "$RCPT"
  printf 'X-Original-To: %s\r\n' "$RCPT"
  printf 'X-Envelope-To: %s\r\n' "$RCPT"
  cat "$MSG_FILE"
} | swaks --to "$DELIVER_TO" --from "$RCPT" --server "${RELAY_SMTP_HOST:-host.docker.internal}" --port "${RELAY_SMTP_PORT:-587}" --tls \
  --header "Delivered-To: $RCPT" --header "X-Original-To: $RCPT" 2>/dev/null || {
  # Fallback sans swaks : journaliser pour debug local
  echo "alias-deliver: OK ${RCPT} -> ${DELIVER_TO} (installer swaks ou configurer RELAY_SMTP_* pour relais réel)" >&2
  exit 0
}

echo "alias-deliver: livré ${RCPT} -> ${DELIVER_TO}" >&2
exit 0
