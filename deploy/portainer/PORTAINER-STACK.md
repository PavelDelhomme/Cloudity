# Stack Portainer « cloudity-stack » — déploiement Git

Guide **condensé**. Pour le détail **champ par champ** (auth PAT, Additional paths, alternatives, dépannage) :

→ **[docs/operations/PORTAINER-STACK-GIT-COMPLET.md](../../docs/operations/PORTAINER-STACK-GIT-COMPLET.md)**  
→ Versions : **[docs/operations/VERSIONS-PROJET.md](../../docs/operations/VERSIONS-PROJET.md)**

**Dépôt** : `https://github.com/PavelDelhomme/Cloudity.git`

---

## 1. Workflow Git (dev → prod)

| Branche | Rôle | Portainer |
|---------|------|-----------|
| `feat/nom-du-chantier` | Travail quotidien | — (local `make up` / `make test`) |
| `dev` | Intégration, CI verte | Optionnel : **`cloudity-stack-dev`** → `refs/heads/dev` |
| `main` | **Production stable** | **`cloudity-stack`** → `refs/heads/main` |

```text
feat/*  →  PR vers dev  →  tests OK  →  merge dev → main  →  Portainer redéploie
```

- **Jamais** de `.env` avec secrets sur GitHub.
- Secrets = **Portainer → Environment variables** uniquement.

Docs : [BRANCHES.md](../../docs/operations/BRANCHES.md) · [DEPLOIEMENT-SUIVI.md](../../docs/operations/DEPLOIEMENT-SUIVI.md).

---

## 2. Formulaire Portainer — `cloudity-stack` (prod)

**Stacks → Add stack** :

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-stack` |
| **Build method** | **Git repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity.git` |
| **Repository reference** | `refs/heads/main` |
| **Compose path** | `deploy/portainer/docker-compose.stack.yml` |
| **Additional paths** | `docker-compose.yml` · `docker-compose.prod.yml` · `backend/` · `frontend/` (voir guide complet § 2.6) |
| **Authentication** | Repo **privé** : user GitHub + PAT (`repo`) |
| **Skip TLS Verification** | Non |

### GitOps updates

| Option | Valeur |
|--------|--------|
| GitOps | **Activé** |
| Polling | ex. **5 minutes** |
| Reference | `refs/heads/main` |

### Stack dev (optionnel)

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-stack-dev` |
| **Repository reference** | `refs/heads/dev` |
| **Compose path** | `deploy/portainer/docker-compose.stack-dev.yml` |

---

## 3. Variables d'environnement

**Advanced mode** dans Portainer. Modèle : [stack.env.example](./stack.env.example).

### Génération recommandée (depuis ton PC)

```bash
# Fusionne .env (secrets locaux) + .env.example + overlays prod, puis sync les URLs
make env-prod DOMAIN=cloudity.ton-domaine.tld
# Si .env.prod existe déjà :
make env-prod DOMAIN=cloudity.ton-domaine.tld FORCE=1

# Affiche KEY=VALUE à coller dans Portainer
make portainer-env

# Après édition manuelle de CLOUDITY_PUBLIC_* dans .env.prod :
ENV_FILE=.env.prod make sync-public-urls
```

Équivalent bas niveau : `./scripts/dev/env-prepare.sh prod --domain cloudity.example`.

Préprod : `make env-preprod DOMAIN=preprod.cloudity.example` → `.env.preprod` puis `make portainer-env FILE=.env.preprod`.

### À la main

```bash
make secrets-print
```

Puis adapte les URLs HTTPS (`CLOUDITY_PUBLIC_*` + `make sync-public-urls`, ou `VITE_API_URL` / `CORS_ORIGINS` / `WEBAUTHN_*` / `CLOUDITY_MOBILE_GATEWAY_URL`).

---

## 4. NPM (HTTPS)

| FQDN | Forward Hostname | Port | SSL |
|------|------------------|------|-----|
| `api.cloudity.<domaine>` | **`cloudity-api-gateway`** | **8000** | Let's Encrypt + Force SSL |
| `cloudity.<domaine>` | **`cloudity-web`** | **3000** | Let's Encrypt + Force SSL |

**Erreurs fréquentes** (502 / 500 OpenResty alors que le certificat LE est OK) :

| Mauvais | Bon |
|---------|-----|
| Forward `cloudity:80` | `cloudity-web` **port 3000** |
| Forward IP:80 / autre stack | `cloudity-api-gateway` **port 8000** |
| Conteneurs hors réseau NPM | Joindre web + gateway au réseau NPM (`NPM_NETWORK` dans la stack) |

Vérif depuis le PC :

```bash
make h14-https-check
# ou : WEB=https://cloudity.delhomme.ovh API=https://api.cloudity.delhomme.ovh ./scripts/dev/h14-https-check.sh
```

Voir [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md).

---

## 4 bis. Premier déploiement depuis ton PC (sans tout faire à la main)

1. **Sur le PC** (déjà fait si `.env.prod` existe) :
   ```bash
   make env-prod DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh FORCE=1
   make portainer-env          # copier tout le bloc
   ```
2. **Portainer → Stacks → Add stack** (Git) :
   - Name : `cloudity`
   - Repo : `https://github.com/PavelDelhomme/Cloudity.git`
   - Reference : `refs/heads/dev` (ou `main` quand stabilisé)
   - Compose path : `deploy/portainer/docker-compose.stack.yml`
   - Env Advanced : coller `make portainer-env` + ajoute `NPM_NETWORK=<nom exact du réseau NPM>` (Portainer → Networks)
3. **Deploy** (premier build long).
4. **Corrige les 2 Proxy Hosts NPM** (§ 4) si tu as mis `cloudity:80`.
5. `make h14-https-check` → doit passer health 200.

### Ensuite : déployer un seul composant

| Où | Comment |
|----|---------|
| **Local (PC)** | `make deploy-web` · `make deploy-gateway` · `make deploy-auth` · … — voir [DEPLOIEMENT-PAR-SERVICE.md](../../docs/operations/DEPLOIEMENT-PAR-SERVICE.md) |
| **VPS** | Portainer → stack → conteneur → **Recreate** (ou Pull & Redeploy si image GHCR) |
| **Mobile** | Jamais Portainer : `make run-mobile APP=Mail` avec `CLOUDITY_MOBILE_GATEWAY_URL=https://api.cloudity.…` |

Le flux « GitOps » Portainer (poll branche) évite de coller le compose à chaque fois : tu pushes, Portainer reconstruit.

---

## 5. Première mise en service (après Deploy)

1. Vérifier `cloudity-db-migrate` terminé (logs Portainer).
2. Compte admin (seed / `SEED_ADMIN_*` dans env).
3. `make h14-https-check` puis éventuellement `make smoke-prod`.

---

## 6. Fichiers

| Fichier | Branche |
|---------|---------|
| `docker-compose.stack.yml` | `main` (prod) |
| `docker-compose.stack-dev.yml` | `dev` |
| `stack.env.example` | modèle variables |
