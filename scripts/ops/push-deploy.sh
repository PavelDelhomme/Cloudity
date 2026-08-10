#!/usr/bin/env bash
# scripts/ops/push-deploy.sh — publier Cloudity vers préprod / prod (GHCR + rappel Portainer).
#
# Ce n’est PAS `make prod` (compose local). Ici :
#   1) vérifie / prépare l’env (.env.prod | .env.preprod)
#   2) déclenche le workflow GitHub « Docker — build & publish (GHCR) »
#   3) affiche les KEY=VALUE Portainer + les étapes NPM / smoke
#
# Usage :
#   ./scripts/ops/push-deploy.sh prod
#   ./scripts/ops/push-deploy.sh preprod
#   REF=dev WAIT=1 ./scripts/ops/push-deploy.sh preprod
#   SKIP_GHCR=1 ./scripts/ops/push-deploy.sh prod          # seulement env + checklist
#   SMOKE=1 WAIT=1 ./scripts/ops/push-deploy.sh prod        # après workflow → smoke HTTPS
#
# Make :
#   make push-prod
#   make push-preprod REF=dev WAIT=1
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
case "$TARGET" in
  prod|preprod) ;;
  *)
    echo "Usage: $0 prod|preprod" >&2
    echo "  make push-prod   ·  make push-preprod" >&2
    exit 2
    ;;
esac

REF="${REF:-}"
WAIT="${WAIT:-0}"
SKIP_ENV="${SKIP_ENV:-0}"
SKIP_GHCR="${SKIP_GHCR:-0}"
SMOKE="${SMOKE:-0}"
DOMAIN="${DOMAIN:-}"
FORCE="${FORCE:-0}"

if [[ "$TARGET" == "prod" ]]; then
  ENV_FILE=".env.prod"
  ENV_MAKE="env-prod"
  DEFAULT_REF="main"
  ZF_ENV="cloudity"
  WEB_DEFAULT="https://cloudity.delhomme.ovh"
  API_DEFAULT="https://api.cloudity.delhomme.ovh"
else
  ENV_FILE=".env.preprod"
  ENV_MAKE="env-preprod"
  DEFAULT_REF="dev"
  ZF_ENV="cloudity-preprod"
  WEB_DEFAULT="https://cloudity.delhomme.ovh"
  API_DEFAULT="https://api.cloudity.delhomme.ovh"
fi

if [[ -z "$REF" ]]; then
  REF="$DEFAULT_REF"
fi

WORKFLOW_NAME="Docker — build & publish (GHCR)"

echo "════════════════════════════════════════════════════════"
echo " Cloudity push → ${TARGET}  (ref=${REF})"
echo "════════════════════════════════════════════════════════"
echo ""

# --- 0. Prérequis gh ---
if [[ "$SKIP_GHCR" != "1" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "❌ gh (GitHub CLI) requis pour publier les images GHCR." >&2
    echo "   Installe : https://cli.github.com/  ·  ou SKIP_GHCR=1 pour checklist seule." >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "❌ gh non authentifié. Lance : gh auth login" >&2
    exit 1
  fi
fi

# --- 1. Env Portainer ---
if [[ "$SKIP_ENV" != "1" ]]; then
  if [[ ! -f "$ENV_FILE" ]] || [[ "$FORCE" == "1" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
      echo "📄 ${ENV_FILE} absent — génération (${ENV_MAKE})…"
    else
      echo "📄 FORCE=1 — régénération ${ENV_FILE}…"
    fi
    if [[ -z "$DOMAIN" && ! -f "$ENV_FILE" ]]; then
      echo "⚠️  DOMAIN non fourni. Exemple :" >&2
      echo "   make push-${TARGET} DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh FORCE=1" >&2
      if [[ ! -f "$ENV_FILE" ]]; then
        echo "❌ Impossible de continuer sans ${ENV_FILE}. Passe DOMAIN=… ou crée le fichier." >&2
        exit 1
      fi
    else
      args="$TARGET"
      [[ -n "$DOMAIN" ]] && args="$args --domain $DOMAIN"
      [[ -n "${HOST:-}" ]] && args="$args --host $HOST"
      [[ -n "${API_HOST:-}" ]] && args="$args --api-host $API_HOST"
      [[ -n "${WEB_HOST:-}" ]] && args="$args --web-host $WEB_HOST"
      [[ "$FORCE" == "1" ]] && args="$args --force"
      chmod +x scripts/dev/env-prepare.sh scripts/dev/sync-public-urls.sh 2>/dev/null || true
      # shellcheck disable=SC2086
      ./scripts/dev/env-prepare.sh $args
    fi
  else
    echo "✅ ${ENV_FILE} présent (SKIP_ENV=1 pour ignorer ; FORCE=1 pour régénérer)"
  fi
else
  echo "⏭️  SKIP_ENV=1 — pas de touche à ${ENV_FILE}"
fi

echo ""
echo "—— Portainer / ZoneForge (${ZF_ENV}) — colle ce bloc (Advanced env) ——"
chmod +x scripts/dev/portainer-env-print.sh 2>/dev/null || true
./scripts/dev/portainer-env-print.sh "$ENV_FILE" || true
echo "# Ajoute aussi : NPM_NETWORK=<réseau Docker exact de NPM>"
echo "————————————————————————————————————————————————————————"
echo ""

# --- 2. Publish GHCR ---
if [[ "$SKIP_GHCR" == "1" ]]; then
  echo "⏭️  SKIP_GHCR=1 — workflow GHCR non déclenché"
else
  echo "📦 Déclenchement workflow « ${WORKFLOW_NAME} » (ref=${REF})…"
  if ! gh workflow run "$WORKFLOW_NAME" --ref "$REF"; then
    echo "❌ Échec gh workflow run. Vérifie le nom du workflow / la branche ${REF}." >&2
    echo "   Liste : gh workflow list" >&2
    exit 1
  fi
  echo "✅ Workflow demandé."
  echo "   Suivi : gh run list --workflow=\"${WORKFLOW_NAME}\" --limit 5"
  echo "   Ou    : gh run watch   (après WAIT=1)"

  if [[ "$WAIT" == "1" ]]; then
    echo ""
    echo "⏳ WAIT=1 — attente du run le plus récent…"
    sleep 3
    run_id="$(gh run list --workflow="$WORKFLOW_NAME" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    if [[ -z "$run_id" || "$run_id" == "null" ]]; then
      echo "⚠️  Impossible de résoudre run_id — regarde : gh run list --workflow=\"${WORKFLOW_NAME}\""
    else
      echo "   run_id=${run_id}"
      gh run watch "$run_id" --exit-status
      echo "✅ Build & publish GHCR terminé (run ${run_id})"
    fi
  fi
fi

# --- 3. Checklist humaine (Portainer GitOps / NPM) ---
echo ""
echo "════════════════════════════════════════════════════════"
echo " Suite côté serveur (à faire une fois le publish vert)"
echo "════════════════════════════════════════════════════════"
cat <<EOF
1. Portainer → stack cloudity-stack (ou ${ZF_ENV})
   · GitOps ON → pull auto ~5 min, OU bouton « Update the stack »
   · Compose : deploy/portainer/docker-compose.stack.yml
   · Branche : ${REF}
   · Env : bloc ci-dessus + NPM_NETWORK=…

2. NPM (Nginx Proxy Manager) — forwards
   · cloudity.<domaine>     → cloudity-web:3000
   · api.cloudity.<domaine> → cloudity-api-gateway:8000
   · Force SSL + LE

3. ZoneForge (quand ZF-01…03 prêts)
   · Env ${ZF_ENV} · sync providers · publish / redeploy
   · Stub : deploy/zoneforge/CLOUDITY-ENV.stub.md

4. Smoke HTTPS
   make h14-https-check
   # ou : SMOKE=1 make push-${TARGET} WAIT=1
   # ou : SMOKE_APP_URL=… SMOKE_API_URL=… ./scripts/ops/smoke-prod.sh

Local (ne confonds pas) :
   make up-ready / make up-full     # PC
   make prod                        # compose prod LOCAL seulement
   make mobile-emulator-cloudity-start && make test-mobile-avd
EOF

# --- 4. Smoke optionnel ---
if [[ "$SMOKE" == "1" ]]; then
  echo ""
  echo "🔎 SMOKE=1 — h14-https-check…"
  chmod +x scripts/dev/h14-https-check.sh 2>/dev/null || true
  WEB="${WEB:-$WEB_DEFAULT}" API="${API:-$API_DEFAULT}" ./scripts/dev/h14-https-check.sh || {
    echo "⚠️  Smoke HTTPS en échec (stack VPS / NPM peut encore builder)." >&2
    exit 1
  }
fi

echo ""
echo "✅ push-${TARGET} : checklist affichée$([ "$SKIP_GHCR" = "1" ] || echo " · GHCR déclenché (ref=${REF})") ."
