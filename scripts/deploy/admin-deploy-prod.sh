#!/usr/bin/env bash
# Déploiement prod depuis la machine de dev (comme YTMusic admin-deploy-prod).
# Usage :
#   bash scripts/deploy/admin-deploy-prod.sh web|mobile|all
#
# web    : merge dev → prod + push → GHCR :latest + redeploy VPS
# mobile : build APK + manifeste OTA (APP=Mail par défaut)
# all    : web puis mobile
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-web}"
APP="${APP:-Mail}"
STASHED=0

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

if [[ "${GO_ENV:-development}" == "production" && "${ALLOW_REMOTE_ADMIN_DEPLOY:-0}" != "1" ]]; then
  echo "Refus : déploiement Admin réservé à l'environnement local/dev." >&2
  exit 2
fi

cleanup_stash() {
  if [[ "$STASHED" == "1" ]]; then
    echo "==> Restauration du stash local…"
    git stash pop || echo "    (stash pop conflictuel — vérifie git stash list)"
  fi
}
trap cleanup_stash EXIT

ensure_clean_or_stash() {
  if [[ -z "$(git status --porcelain)" ]]; then
    return 0
  fi
  echo "==> Working tree sale — stash automatique"
  git status --short
  git stash push -u -m "admin-deploy-auto $(date -Iseconds)"
  STASHED=1
}

sync_dev_from_current() {
  local current
  current="$(git branch --show-current)"
  echo "==> Push branche courante ($current)…"
  git push -u origin HEAD 2>/dev/null || git push origin HEAD

  if [[ "$current" != "dev" && "$current" != "prod" && "$current" != "main" ]]; then
    echo "==> Merge $current → origin/dev…"
    git fetch origin
    git checkout dev 2>/dev/null || git checkout -b dev origin/dev
    git pull origin dev
    git merge "origin/$current" -m "merge: $current → dev (admin-deploy)" || true
    git push origin dev
    git checkout "$current"
  elif [[ "$current" == "dev" ]]; then
    git push origin dev
  fi
}

deploy_web() {
  ensure_clean_or_stash
  sync_dev_from_current

  echo "==> Web : merge origin/dev → prod + push (images GHCR :latest)"
  git fetch origin
  local current
  current="$(git branch --show-current)"
  git checkout prod 2>/dev/null || git checkout -b prod origin/prod 2>/dev/null || git checkout -b prod
  git pull origin prod 2>/dev/null || true
  if git show-ref --verify --quiet refs/remotes/origin/dev; then
    git merge origin/dev -m "merge: promu dev → prod (admin-deploy)" || true
  fi
  git push -u origin prod 2>/dev/null || git push origin prod
  git checkout "$current"
  echo "==> Push prod OK — GitHub Actions build ghcr.io/…/cloudity-*:latest"

  bash "$ROOT/scripts/deploy/redeploy-vps.sh"
}

deploy_mobile() {
  echo "==> Mobile : build + upload OTA"
  chmod +x "$ROOT/scripts/mobile/android-publish-apk.sh" \
    "$ROOT/scripts/mobile/publish-apk-remote.sh" \
    "$ROOT/scripts/mobile/mobile-upload-all.sh" 2>/dev/null || true
  if [[ "${APP}" == "all" || "${APP}" == "ALL" ]]; then
    DEPLOY_URL="${DEPLOY_URL:-https://api.cloudity.delhomme.ovh}" \
      bash "$ROOT/scripts/mobile/mobile-upload-all.sh"
  else
    APP="$APP" bash "$ROOT/scripts/mobile/android-publish-apk.sh"
    if [[ -n "${DEPLOY_URL:-}" ]]; then
      APP="$APP" DEPLOY_URL="${DEPLOY_URL}" bash "$ROOT/scripts/mobile/publish-apk-remote.sh"
    else
      echo "    (DEPLOY_URL vide — manifeste local seulement ; set DEPLOY_URL pour upload)"
    fi
  fi
}

case "$MODE" in
  web) deploy_web ;;
  mobile|apk) deploy_mobile ;;
  all)
    deploy_web
    deploy_mobile
    ;;
  *)
    echo "Usage: $0 web|mobile|all" >&2
    exit 1
    ;;
esac

echo ""
echo "==> Terminé ($MODE)"
