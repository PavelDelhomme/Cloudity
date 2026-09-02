#!/usr/bin/env bash
# Crée (ou met à jour) la stack Git Portainer « cloudity » via API CE.
# Prérequis :
#   PORTAINER_URL=https://portainer.delhomme.ovh
#   PORTAINER_USER=admin
#   PORTAINER_PASSWORD=…   # ou PORTAINER_API_KEY=ptr_…
#   ENV_FILE=deploy/portainer/stack.env
#
# Usage :
#   PORTAINER_USER=… PORTAINER_PASSWORD=… ./scripts/deploy/portainer-create-cloudity-stack.sh
#   STACK=cloudity-dev COMPOSE_PATH=docker-compose.ghcr-dev.yml REF=refs/heads/dev \
#     ENV_FILE=deploy/portainer/stack.env.dev ./scripts/deploy/portainer-create-cloudity-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${PORTAINER_URL:-https://portainer.delhomme.ovh}"
BASE="${BASE%/}"
STACK_NAME="${STACK:-cloudity}"
REPO="${PORTAINER_GIT_REPO:-https://github.com/PavelDelhomme/Cloudity.git}"
REF="${REF:-refs/heads/prod}"
COMPOSE_PATH="${COMPOSE_PATH:-docker-compose.ghcr.yml}"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/portainer/stack.env}"
ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ ENV_FILE introuvable : $ENV_FILE" >&2
  exit 1
fi

TOKEN="${PORTAINER_API_KEY:-}"
if [[ -z "$TOKEN" ]]; then
  : "${PORTAINER_USER:?PORTAINER_USER ou PORTAINER_API_KEY requis}"
  : "${PORTAINER_PASSWORD:?PORTAINER_PASSWORD requis}"
  TOKEN="$(
    curl -fsS -X POST "$BASE/api/auth" \
      -H 'Content-Type: application/json' \
      -d "{\"username\":\"$PORTAINER_USER\",\"password\":\"$PORTAINER_PASSWORD\"}" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)["jwt"])'
  )"
fi

AUTH_H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# Env → JSON array [{name,value}]
ENV_JSON="$(python3 - <<PY
import json
from pathlib import Path
pairs=[]
for line in Path("$ENV_FILE").read_text().splitlines():
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k,v=line.split("=",1)
    pairs.append({"name":k, "value":v})
print(json.dumps(pairs))
PY
)"

# Stack existante ?
STACKS="$(curl -fsS "${AUTH_H[@]}" "$BASE/api/stacks")"
EXISTING_ID="$(python3 - <<PY
import json,os
name=os.environ.get("STACK_NAME","$STACK_NAME")
stacks=json.loads('''$STACKS''')
for s in stacks:
    if s.get("Name")==name:
        print(s["Id"]); break
PY
)"

BODY="$(python3 - <<PY
import json
body={
  "Name": "$STACK_NAME",
  "RepositoryURL": "$REPO",
  "RepositoryReferenceName": "$REF",
  "ComposeFile": "$COMPOSE_PATH",
  "AdditionalFiles": [],
  "RepositoryAuthentication": False,
  "Env": json.loads('''$ENV_JSON'''),
  "TLSSkipVerify": False,
  "AutoUpdate": {
    "Interval": "5m",
    "Webhook": "",
    "ForcePullImage": True,
    "ForceUpdate": False,
  },
}
print(json.dumps(body))
PY
)"

if [[ -n "$EXISTING_ID" ]]; then
  echo "==> Stack $STACK_NAME existe (id=$EXISTING_ID) — git redeploy"
  # PUT git stack : /api/stacks/{id}/git/redeploy?endpointId=
  curl -fsS -X PUT "${AUTH_H[@]}" \
    "$BASE/api/stacks/${EXISTING_ID}/git/redeploy?endpointId=${ENDPOINT_ID}" \
    -d "{\"RepositoryAuthentication\":false,\"Env\":$ENV_JSON,\"PullImage\":true,\"Prune\":false}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK", d.get("Name"), d.get("Id"))'
else
  echo "==> Création stack Git $STACK_NAME (ref=$REF compose=$COMPOSE_PATH)"
  curl -fsS -X POST "${AUTH_H[@]}" \
    "$BASE/api/stacks/create/repository?endpointId=${ENDPOINT_ID}&method=repository" \
    -d "$BODY" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK", d.get("Name"), d.get("Id"))'
fi

echo "✅ Portainer stack $STACK_NAME prête"
echo "   Compose: $COMPOSE_PATH · Ref: $REF"
echo "   ⚠️  Si des conteneurs SSH existent déjà avec les mêmes noms : laisse Portainer les adopter,"
echo "       ou stoppe-les AVANT Deploy (volumes cloudity_* conservés)."
