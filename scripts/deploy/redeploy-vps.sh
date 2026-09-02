#!/usr/bin/env bash
# Redeploy Cloudity sur le VPS — SANS webhook Portainer (réservé Pro).
# Stratégies (ordre) :
#   1) SSH          → DEPLOY_SSH (+ DEPLOY_SSH_CMD optionnel)
#   2) Portainer CE → PORTAINER_URL + PORTAINER_API_KEY
#   3) Watchtower   → message d'aide (poll auto)
#
# Appelé par admin-deploy-prod.sh et make redeploy-vps après push prod.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

REGISTRY_OWNER="${REGISTRY_OWNER:-paveldelhomme}"
TAG="${CLOUDITY_IMAGE_TAG:-latest}"
STACK_NAME="${PORTAINER_STACK_NAME:-cloudity}"
WORKFLOW_NAME="${CLOUDITY_GHCR_WORKFLOW:-Docker — build & publish (GHCR)}"
WAIT_BUILD="${DEPLOY_WAIT_BUILD:-1}"
WAIT_SECS="${DEPLOY_IMAGE_WAIT_SECS:-180}"
DEPLOY_BRANCH="${CLOUDITY_DEPLOY_BRANCH:-prod}"

wait_for_ghcr_build() {
  if [[ "$WAIT_BUILD" != "1" ]]; then
    echo "==> Skip attente CI (DEPLOY_WAIT_BUILD=$WAIT_BUILD)"
    return 0
  fi
  if command -v gh >/dev/null 2>&1; then
    echo "==> Attente GitHub Actions (${WORKFLOW_NAME} / branche ${DEPLOY_BRANCH})…"
    local run_id
    run_id="$(
      gh run list --limit 5 --json databaseId,name,headBranch \
        --jq "[.[] | select(.name|test(\"Docker\";\"i\")) | select(.headBranch==\"${DEPLOY_BRANCH}\")][0].databaseId // empty" 2>/dev/null || true
    )"
    if [[ -z "$run_id" ]]; then
      run_id="$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
    fi
    if [[ -n "$run_id" ]]; then
      gh run watch "$run_id" --exit-status
      echo "==> Images GHCR à jour (run $run_id, tag=${TAG})"
      return 0
    fi
    echo "==> Pas de run GH trouvé — attente fixe ${WAIT_SECS}s"
  else
    echo "==> gh CLI absent — attente fixe ${WAIT_SECS}s"
  fi
  sleep "$WAIT_SECS"
}

redeploy_ssh() {
  local target="${DEPLOY_SSH:-}"
  [[ -n "$target" ]] || return 1
  # Défaut : stack Git/compose sur le VPS (volumes cloudity_* conservés).
  local cmd="${DEPLOY_SSH_CMD:-cd /tmp/cloudity-build && docker compose -p cloudity -f docker-compose.ghcr.yml --env-file .env pull && docker compose -p cloudity -f docker-compose.ghcr.yml --env-file .env up -d --remove-orphans}"
  echo "==> Redeploy SSH → $target"
  # shellcheck disable=SC2029
  ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "$target" "$cmd"
}

redeploy_portainer_api() {
  local base="${PORTAINER_URL:-}"
  local key="${PORTAINER_API_KEY:-}"
  [[ -n "$base" && -n "$key" ]] || return 1
  base="${base%/}"

  echo "==> Redeploy via Portainer API CE → $base (stack=$STACK_NAME)"

  export PORTAINER_URL="$base" PORTAINER_API_KEY="$key" PORTAINER_STACK_NAME="$STACK_NAME"
  export PORTAINER_STACK_ID="${PORTAINER_STACK_ID:-}" PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-}"

  python3 <<'PY'
import json, os, sys, urllib.error, urllib.parse, urllib.request

base = os.environ["PORTAINER_URL"].rstrip("/")
key = os.environ["PORTAINER_API_KEY"]
name = os.environ["PORTAINER_STACK_NAME"]
force_id = os.environ.get("PORTAINER_STACK_ID") or ""
force_ep = os.environ.get("PORTAINER_ENDPOINT_ID") or ""

def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(
        base + path, data=data, method=method,
        headers={"X-API-Key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=180) as res:
            raw = res.read().decode() or "{}"
            return res.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        raise SystemExit(f"HTTP {e.code} {path}: {err[:500]}") from e

_, stacks = req("GET", "/api/stacks")
if not isinstance(stacks, list):
    raise SystemExit(f"Réponse stacks inattendue: {stacks!r}")

stack = next((s for s in stacks if s.get("Name") == name), None)
if not stack and force_id:
    stack = next((s for s in stacks if str(s.get("Id")) == str(force_id)), None)
if not stack:
    names = [s.get("Name") for s in stacks]
    raise SystemExit(f"Stack « {name} » introuvable. Dispo: {names}")

sid = int(force_id or stack["Id"])
ep = int(force_ep or stack.get("EndpointId") or 1)
is_git = bool(stack.get("GitConfig"))
print(f"    stackId={sid} endpointId={ep} type={'git' if is_git else 'file'}")

if is_git:
    code, _ = req("PUT", f"/api/stacks/{sid}/git/redeploy?endpointId={ep}",
                  {"pullImage": True, "RepullImageAndRedeploy": True})
    print(f"    git/redeploy → HTTP {code}")
else:
    _, file_info = req("GET", f"/api/stacks/{sid}/file")
    content = file_info.get("StackFileContent") or ""
    if not content:
        raise SystemExit("StackFileContent vide")
    code, _ = req("PUT", f"/api/stacks/{sid}?endpointId={ep}",
                  {"StackFileContent": content, "Prune": False,
                   "pullImage": True, "RepullImageAndRedeploy": True})
    print(f"    stack update + repull → HTTP {code}")
print("==> Portainer API : redeploy OK")
PY
}

print_help() {
  echo "==> Aucun SSH / Portainer API configuré"
  echo ""
  echo "    Portainer CE n'a PAS les webhooks (Pro). Contournements :"
  echo ""
  echo "    A) Watchtower (recommandé) — deploy/watchtower-compose.yml"
  echo "       Label watchtower sur les services Cloudity → pull auto :${TAG}"
  echo ""
  echo "    B) Access Token Portainer (gratuit CE)"
  echo "       PORTAINER_URL=https://portainer.ton-domaine"
  echo "       PORTAINER_API_KEY=ptr_…"
  echo "       PORTAINER_STACK_NAME=cloudity"
  echo ""
  echo "    C) SSH : DEPLOY_SSH=user@ip-vps"
  echo ""
  echo "    Sinon : Portainer UI → stack → Pull and redeploy (NE PAS Remove volumes)"
}

main() {
  echo "==> Redeploy VPS Cloudity (ghcr.io/${REGISTRY_OWNER}/cloudity-*:${TAG})"
  wait_for_ghcr_build

  if [[ -n "${DEPLOY_SSH:-}" ]]; then
    redeploy_ssh
    echo "==> OK (SSH)"
    return 0
  fi
  if [[ -n "${PORTAINER_URL:-}" && -n "${PORTAINER_API_KEY:-}" ]]; then
    redeploy_portainer_api
    echo "==> OK (Portainer API CE)"
    return 0
  fi
  print_help
}

main "$@"
