# Installation Portainer PROD — Cloudity (première fois)

Guide pas à pas pour ton VPS (`95.111.227.204`), NPM déjà en place, stack **cloudity** Portainer.

---

## ⚠️ Corrections NPM (à faire AVANT de déployer)

Tu as actuellement :

| Proxy | Problème |
|-------|----------|
| `http://95.111.227.204:80` | ❌ IP brute — supprime ou remplace par le domaine |
| `http://cloudity:80` | ❌ mauvais hostname **et** mauvais port |

### Proxy Host 1 — Web (interface Cloudity)

| Champ | Valeur |
|-------|--------|
| **Domain names** | `cloudity.delhomme.ovh` |
| **Scheme** | `http` |
| **Forward hostname** | `cloudity-web` |
| **Forward port** | `3000` |
| **Websockets** | ON |
| **SSL** | Let's Encrypt + Force SSL |

### Proxy Host 2 — API (gateway)

| Champ | Valeur |
|-------|--------|
| **Domain names** | `api.cloudity.delhomme.ovh` |
| **Scheme** | `http` |
| **Forward hostname** | `cloudity-api-gateway` |
| **Forward port** | `8000` |
| **Websockets** | ON |
| **SSL** | Let's Encrypt + Force SSL |
| **Advanced** | `client_max_body_size 200m;` (uploads Drive/Photos) |

> Les hostnames `cloudity-web` et `cloudity-api-gateway` sont les **container_name** du compose — NPM doit être sur le **même réseau Docker** que la stack.

### DNS (OVH)

```
cloudity.delhomme.ovh      A  →  95.111.227.204
api.cloudity.delhomme.ovh  A  →  95.111.227.204
```

---

## 1. Trouver le nom du réseau NPM

Sur le VPS (SSH) :

```bash
docker network ls | grep -i nginx
```

Note le nom exact, souvent :

- `nginx-proxy-manager_npm-network` (comme YTMusic)
- ou `nginx-proxy-manager_default`

Tu le mettras dans Portainer : **`NPM_NETWORK=<ce nom exact>`**

---

## 2. Générer les variables Portainer (sur ton PC)

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity

chmod +x scripts/ops/generate-portainer-prod-env.sh

NPM_NETWORK=nginx-proxy-manager_npm-network \
  ./scripts/ops/generate-portainer-prod-env.sh
```

Copie **tout** le bloc `KEY=VALUE` affiché.

Ou via Make :

```bash
make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
```

---

## 3. Créer la stack Portainer `cloudity`

### ⚠️ Important : déploiement Git (pas Web editor seul)

Le service `db-migrate` monte `scripts/` et `migrations/` depuis le dépôt — **obligatoire en mode Repository**.

| Champ Portainer | Valeur |
|-----------------|--------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` (ou `refs/heads/main` en attendant) |
| **Compose path** | `deploy/portainer/docker-compose.ghcr.yml` |
| **Authentication** | Token GitHub si repo privé |
| **Environment variables** | Coller le bloc généré § 2 |
| **GitOps** | Optionnel ON (pull auto ~5 min) |

Si tu as collé le YAML en **Web editor** sans Git : la stack **plantera** sur `db-migrate` (chemins `../../scripts` introuvables). Recrée la stack en mode **Repository**.

---

## 4. Variables Portainer — liste complète

### Obligatoires (stack ne démarre pas sans)

| Variable | Exemple / règle |
|----------|-----------------|
| `REGISTRY_OWNER` | `PavelDelhomme` |
| `TAG` | `latest` (prod) ou `dev` (préprod) |
| `NPM_NETWORK` | `nginx-proxy-manager_npm-network` |
| `POSTGRES_USER` | `cloudity_admin` |
| `POSTGRES_PASSWORD` | **64 hex** — `openssl rand -hex 32` |
| `POSTGRES_DB` | `cloudity` |
| `REDIS_PASSWORD` | **64 hex** — `openssl rand -hex 32` |
| `JWT_SECRET` | **64 hex** — `openssl rand -hex 32` |
| `PERFORMANCE_INGEST_TOKEN` | **64 hex** — `openssl rand -hex 32` |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | **64 hex** — `openssl rand -hex 32` |
| `CORS_ORIGINS` | `https://cloudity.delhomme.ovh` |

### URLs publiques (prod)

| Variable | Valeur prod |
|----------|-------------|
| `CLOUDITY_PUBLIC_HOST` | `cloudity.delhomme.ovh` |
| `CLOUDITY_PUBLIC_PROTO` | `https` |
| `CLOUDITY_PUBLIC_API_HOST` | `api.cloudity.delhomme.ovh` |
| `CLOUDITY_PUBLIC_OMIT_PORTS` | `true` |
| `VITE_API_URL` | `https://api.cloudity.delhomme.ovh` |
| `CLOUDITY_MOBILE_GATEWAY_URL` | `https://api.cloudity.delhomme.ovh` |
| `CORS_ALLOW_LAN` | `false` |
| `GO_ENV` | `production` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |

### WebAuthn (prod)

| Variable | Valeur |
|----------|--------|
| `WEBAUTHN_RP_ID` | `cloudity.delhomme.ovh` |
| `WEBAUTHN_RP_NAME` | `Cloudity` |
| `WEBAUTHN_ORIGINS` | `https://cloudity.delhomme.ovh` |

### Optionnelles (mail / alias — tu peux garder tes valeurs actuelles)

| Variable | Note |
|----------|------|
| `ALIAS_ENCRYPTION_KEY` | base64 32 octets |
| `MAIL_ALIAS_DOMAIN` | ex. `maily.ovh` |
| `MTA_INTERNAL_TOKEN` | hex 64 |
| `SEED_ADMIN_EMAIL` | `paul@delhomme.ovh` |
| `SEED_ADMIN_PASSWORD` | mot de passe initial admin — **change après 1ère connexion** |

### ⛔ Ne pas mettre en prod

- `CLOUDITY_ALLOW_DEV_QUICK_LOGIN=1`
- `CORS_ALLOW_LAN=true`
- mots de passe dev (`cloudity_secure_password`, `Admin1234`, etc.)

---

## 5. Watchtower (MAJ auto — comme YTMusic)

Stack séparée `watchtower` → coller `deploy/watchtower-compose.yml`

Les conteneurs Cloudity ont déjà le label `watchtower.enable=true`.

---

## 6. Publier les images GHCR (depuis ton PC)

```bash
# Créer branche prod si absente
git checkout -b prod
git push -u origin prod

# Build + push images
make push-prod REF=prod WAIT=1

# Ou promote dev → prod (style YTMusic)
make admin-deploy-prod
```

Images attendues : `ghcr.io/paveldelhomme/cloudity-*:latest`

Packages GHCR en **Public** (workflow CI le fait automatiquement) — sinon Portainer ne pull pas.

---

## 7. Vérification après deploy

```bash
make h14-https-check WEB=https://cloudity.delhomme.ovh API=https://api.cloudity.delhomme.ovh
```

Sur le VPS :

```bash
docker ps --filter name=cloudity
curl -s https://api.cloudity.delhomme.ovh/health
curl -sI https://cloudity.delhomme.ovh | head -5
```

---

## 8. Stack DEV (optionnelle — deuxième stack Portainer)

| Champ | Valeur |
|-------|--------|
| Name | `cloudity-dev` |
| Compose path | `deploy/portainer/docker-compose.ghcr.yml` |
| Reference | `refs/heads/dev` |
| `TAG` | `dev` |
| Domaine NPM | `cloudity-preprod.delhomme.ovh` (DNS A séparé) |

Deploy depuis PC : `make push-dev REF=dev WAIT=1`

---

## Dépannage rapide

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| NPM 502 | mauvais forward (`cloudity:80`) | `cloudity-web:3000` |
| API 502 | pas de proxy api | ajouter `api.cloudity…` → `cloudity-api-gateway:8000` |
| Pull GHCR denied | packages privés | Public dans GitHub Packages |
| db-migrate fail | Web editor sans Git | stack en mode Repository |
| CORS error | `CORS_ORIGINS` incorrect | `https://cloudity.delhomme.ovh` exact |
| Login JWT invalidé | volume auth-keys recréé | ne pas cocher « Remove volumes » |

---

## Commandes Make utiles

```bash
make portainer-prod-env          # bloc env à coller
make deploy-hint                 # rappel NPM / Watchtower
make push-prod REF=prod WAIT=1   # CI + checklist
make redeploy-vps                # Portainer API / SSH
```

Doc complète : [DEPLOY.md](../../DEPLOY.md)
