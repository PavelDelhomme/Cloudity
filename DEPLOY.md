# Déploiement Cloudity — guide opérationnel (style YTMusic)

Flux **dev local → GHCR → Portainer VPS → NPM → Watchtower**, avec canaux **prod/dev** et distribution mobile.

---

## 1. Environnements

| Environnement | Où | Branche Git | Tag GHCR | URL type |
|---------------|-----|-------------|----------|----------|
| **Dev local** | PC (`make up-ready`) | `feat/*`, `dev` | — (build local) | `http://localhost:6001` |
| **Préprod VPS** | Portainer stack `cloudity-dev` | `dev` | `:dev` | `https://cloudity-preprod.<domaine>` |
| **Prod VPS** | Portainer stack `cloudity` | `prod` | `:latest` / `:prod` | `https://cloudity.<domaine>` |

Version affichée : **`d+X.Y.Z`** (dev/LAN) · **`p+X.Y.Z`** (prod HTTPS) — source : fichier [`VERSION`](./VERSION).

---

## 2. Première mise en prod (one-time)

```
DNS (A cloudity + api.cloudity → IP VPS)
    ↓
Portainer → stack « cloudity »
    · Compose : deploy/portainer/docker-compose.ghcr.yml
    · Env : make env-prod DOMAIN=… && make portainer-env
    · REGISTRY_OWNER=paveldelhomme · TAG=latest · NPM_NETWORK=…
    ↓
Portainer → stack « watchtower » → deploy/watchtower-compose.yml
    ↓
Nginx Proxy Manager
    · cloudity.<domaine> → cloudity-web:3000
    · api.cloudity.<domaine> → cloudity-api-gateway:8000
    · SSL Let's Encrypt + Force SSL + Websockets ON
    ↓
git push origin prod  (ou make push-prod REF=prod WAIT=1)
    ↓
GitHub Actions → ghcr.io/paveldelhomme/cloudity-*:latest
    ↓
Watchtower pull (~5 min) ou Portainer Pull and redeploy
    ↓
make h14-https-check
```

Doc détaillée : [docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)

---

## 3. Mise à jour quotidienne (comme YTMusic)

### Option A — Admin local (recommandé)

```bash
# Web : merge dev → prod + GHCR + redeploy VPS
make admin-deploy-prod          # web seulement
make admin-deploy-prod MODE=mobile APP=Mail
make admin-deploy-prod MODE=all
```

### Option B — Make classique

```bash
make push-prod REF=prod WAIT=1 SMOKE=1
make redeploy-vps                 # après CI, si Portainer API configurée
```

### Option C — Watchtower (sans rien toucher)

Push `prod` → GHCR `:latest` → Watchtower recrée les conteneurs labellés (~5 min).

---

## 4. Variables `.env` déploiement (PC local)

```bash
# VPS / Portainer CE (pas de webhook Pro)
PORTAINER_URL=https://portainer.ton-domaine
PORTAINER_API_KEY=ptr_…
PORTAINER_STACK_NAME=cloudity

# Fallback SSH
DEPLOY_SSH=user@ip-vps

# Mobile upload prod
DEPLOY_URL=https://cloudity.delhomme.ovh
APK_UPLOAD_TOKEN=…
```

---

## 5. Commandes Make essentielles

| Commande | Rôle |
|----------|------|
| `make up-ready` | Stack dev locale |
| `make push-dev` | Push branche + GHCR tag `:dev` |
| `make push-prod REF=prod WAIT=1` | Prod GHCR + checklist Portainer |
| `make publish-ghcr REF=prod` | GHCR seul |
| `make admin-deploy-prod` | Merge dev→prod + redeploy (style YTMusic) |
| `make redeploy-vps` | Portainer API / SSH / hint Watchtower |
| `make bump-patch` | VERSION 0.1.0 → 0.1.1 |
| `make mobile-publish APP=Mail` | APK + manifeste OTA |
| `make deploy-hint` | Rappel NPM / Portainer / mobile |
| `make h14-https-check` | Smoke HTTPS prod |

---

## 6. Distribution mobile & stores

Voir **[docs/operations/DISTRIBUTION-CHANNELS.md](docs/operations/DISTRIBUTION-CHANNELS.md)** :

- **OTA self-hosted** : APK + `version.json` (script `publish-mobile-manifest.sh`)
- **F-Droid** : métadonnées `deploy/fdroid/`
- **Google Play** : checklist AAB + Play Console (manuel)
- **Desktop Linux** : `DISTRIBUTION-LINUX-DESKTOP.md`

---

## 7. Ne pas confondre

| Commande | Effet |
|----------|-------|
| `make prod` | Compose prod **sur le PC** (pas le VPS) |
| `make push-prod` | Publie images GHCR + checklist **VPS** |
| `make up-full` | Dev local + tests |

---

## 8. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `deploy/portainer/docker-compose.ghcr.yml` | Stack Portainer prod (images GHCR) |
| `deploy/watchtower-compose.yml` | MAJ auto Portainer CE |
| `.github/workflows/docker-publish.yml` | CI build 12 images + public GHCR |
| `scripts/deploy/admin-deploy-prod.sh` | Promote dev→prod |
| `scripts/deploy/redeploy-vps.sh` | Redeploy sans webhook Pro |
| `VERSION` | Semver unique |
