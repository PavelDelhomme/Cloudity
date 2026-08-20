#!/usr/bin/env bash
# Affiche la checklist immédiate après make portainer-prod-env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK_ENV="${ROOT}/deploy/portainer/stack.env"

echo "════════════════════════════════════════════════════════"
echo " Cloudity PROD — prochaines étapes (dans l'ordre)"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. NPM (sur le VPS) — voir deploy/portainer/NPM-PROXY-HOSTS.md"
echo "   · Proxy WEB : cloudity-web:80 + tous les sous-domaines apps"
echo "   · Proxy API : cloudity-api-gateway:8000 (séparé)"
echo "   · Advanced  : deploy/portainer/npm-advanced-web.conf"
echo ""
echo "2. Portainer — voir deploy/portainer/PORTAINER-FORMULAIRE-GIT.md"
if [[ -f "$STACK_ENV" ]]; then
  echo "   · Fichier env : $STACK_ENV ($(wc -l <"$STACK_ENV") lignes)"
  echo "   · Load variables from file dans Portainer"
else
  echo "   · ⚠️  stack.env absent — lance : make portainer-prod-env NPM_NETWORK=..."
fi
echo "   · Repository reference : refs/heads/prod"
  echo "   · Compose path         : docker-compose.ghcr.yml"
echo ""
echo "3. GHCR (PC)"
echo "   · make publish-ghcr REF=prod WAIT=1"
echo ""
echo "4. Test"
echo "   · make h14-https-check WEB=https://cloudity.delhomme.ovh API=https://api.cloudity.delhomme.ovh"
echo ""
echo "État actuel :"
curl -sf --max-time 3 https://api.cloudity.delhomme.ovh/health >/dev/null 2>&1 \
  && echo "   API : ✅ up" || echo "   API : ❌ pas encore (502 normal avant stack)"
curl -sfI --max-time 3 https://cloudity.delhomme.ovh 2>/dev/null | head -1 \
  || echo "   WEB : ❌ pas encore"
