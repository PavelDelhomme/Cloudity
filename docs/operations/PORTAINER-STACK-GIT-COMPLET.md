# Portainer — stack Cloudity via dépôt Git (guide complet)

> **Tu arrives d’où ?** Depuis **[SUIVRE-ICI.md](SUIVRE-ICI.md) § B** (mode prod).  
> Ce fichier = **détail du formulaire** Portainer uniquement. Ne remplace pas SUIVRE-ICI.

**But** : remplir **chaque champ** du formulaire Portainer « Add stack → Git repository », coller les bons fichiers Compose, authentifier GitHub, brancher NPM.

**Audience** : toi sur le VPS (comme Nextcloud) + préparation depuis le PC.

| Sujet | Doc |
|-------|-----|
| **Ce guide** | Formulaire Git Portainer bout en bout |
| Formulaire condensé | [../../deploy/portainer/PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md) |
| NPM + DNS (H14) | [DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md) · [H14-GATEWAY-MOBILE.md](H14-GATEWAY-MOBILE.md) |
| Déployer **un** service | [DEPLOIEMENT-PAR-SERVICE.md](DEPLOIEMENT-PAR-SERVICE.md) |
| Versionnage **libs** partagées | [../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md) |
| Versions **projet / images** | [VERSIONS-PROJET.md](VERSIONS-PROJET.md) |
| Guide global local→prod | [GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md) |

---

## 0. Ce que tu as déjà / ce qui manque (cas delhomme)

| Élément | État typique |
|---------|----------------|
| DNS `cloudity.delhomme.ovh` + `api.cloudity.delhomme.ovh` | OK |
| Certificats Let's Encrypt (NPM) | OK |
| Proxy Hosts NPM | Souvent créés mais **mauvais forward** → 502 |
| Stack Portainer Cloudity | **À créer** (ce guide) |
| Conteneurs `cloudity-web` / `cloudity-api-gateway` | Absents tant que la stack n’est pas Deploy |

Vérif PC :

```bash
make h14-https-check
```

---

## 1. Préparer le PC (avant d’ouvrir Portainer)

```bash
cd ~/…/Cloudity

# URLs prod (exemple delhomme)
make env-prod DOMAIN=delhomme.ovh \
  HOST=cloudity.delhomme.ovh \
  API_HOST=api.cloudity.delhomme.ovh \
  FORCE=1

# Bloc à coller dans Portainer (Advanced env)
make portainer-env
```

**Important** :

- Ne **committe jamais** `.env` / `.env.prod` (secrets).
- Remplace les secrets faibles (`change_me…`, `cloudity_secure_password`) avant prod réelle : `make secrets-print` puis édite `.env.prod` et relance `make portainer-env`.
- Ajoute **à la main** dans le bloc collé : `NPM_NETWORK=<nom exact>` (voir § 6).

---

## 2. Formulaire Portainer — champ par champ

**Portainer → Stacks → Add stack**

### 2.1 Build method

Choisir **Git repository** (recommandé).

Alternatives (§ 8) : Web editor, Custom template, images GHCR.

### 2.2 Name

| Stack | Name recommandé |
|-------|-----------------|
| Prod | `cloudity-stack` (ou `cloudity`) |
| Intégration / essais VPS | `cloudity-stack-dev` |

### 2.3 Repository URL

```text
https://github.com/PavelDelhomme/Cloudity.git
```

(SSH `git@github.com:PavelDelhomme/Cloudity.git` possible si clés déposées sur le VPS — HTTPS + PAT est plus simple.)

### 2.4 Repository reference

| Environnement | Valeur exacte |
|---------------|---------------|
| **Prod stable** | `refs/heads/main` |
| **Intégration / premier essai** | `refs/heads/dev` |
| Tag figé | `refs/tags/v0.5.0` (si tu tags) |

Portainer attend souvent le préfixe `refs/heads/` ou `refs/tags/`.

Workflow :

```text
feat/*  →  merge → dev  →  (tests)  →  merge → main  →  Portainer prod
```

### 2.5 Compose path

Chemin **relatif à la racine du dépôt** (pas un chemin absolu VPS).

| Stack | Compose path |
|-------|----------------|
| **Prod** | `deploy/portainer/docker-compose.stack.yml` |
| **Dev VPS** | `deploy/portainer/docker-compose.stack-dev.yml` |

Ces fichiers font :

```yaml
include:
  - path: ../../docker-compose.yml
  - path: ../../docker-compose.prod.yml   # prod seulement
```

Donc le Compose « entrée » est petit ; le vrai graphe de services est à la racine.

### 2.6 Additional paths (très important)

Portainer clone le dépôt puis lit le Compose path.  
**Additional paths** = fichiers (ou dossiers) **surveillés pour GitOps** + aide Portainer à savoir quels fichiers hors Compose déclenchent un redeploy.

#### Recommandé (prod) — à coller / saisir un par ligne selon UI

```text
docker-compose.yml
docker-compose.prod.yml
deploy/portainer/docker-compose.stack.yml
backend/
frontend/
```

#### Minimal (si l’UI n’accepte que peu de lignes)

```text
docker-compose.yml
docker-compose.prod.yml
```

#### Dev VPS (`stack-dev`)

```text
docker-compose.yml
deploy/portainer/docker-compose.stack-dev.yml
backend/
frontend/
```

#### Pourquoi pas « vide » ?

Avec `include:` + `build:`, un push qui ne touche **que** `backend/api-gateway/` ne change pas le fichier `docker-compose.stack.yml`.  
Sans Additional paths, **GitOps ne redéploie pas**. Avec `backend/` listé, le poll détecte le changement.

#### Ce qu’il ne faut **pas** mettre

| Éviter | Pourquoi |
|--------|----------|
| `.env` / `.env.prod` | Secrets — absents du repo (volontaire) |
| `node_modules/`, `reports/` | Bruit, pas source de build |
| Chemins absolus `/home/...` | Portainer travaille dans le clone Git |

### 2.7 Authentication (repo privé)

Si le dépôt GitHub est **privé** (cas Cloudity) :

| Champ | Valeur |
|-------|--------|
| Authentication | **On** |
| Auth type | **Username / password** (ou Git Credential selon version Portainer) |
| Username | ton **login GitHub** (ex. `PavelDelhomme`) |
| Password | un **PAT** (Personal Access Token), **pas** ton mot de passe GitHub |

#### Créer le PAT (GitHub)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**.
2. Classic : scopes **`repo`** (lecture du dépôt privé).  
   Ou Fine-grained : repository Cloudity → **Contents: Read** (+ Metadata).
3. Copier le token une fois → coller dans Portainer Password.
4. Ne pas committer le PAT.

**Skip TLS Verification** : **Non** (laisser décoché).

### 2.8 GitOps / Auto-update

| Option | Valeur conseillée |
|--------|-------------------|
| GitOps / Automatic updates | **Activé** |
| Fetch interval / Polling | **5 minutes** (ou 1–15 min) |
| Re-pull image / Rebuild | selon UI : pour stack en `pull_policy: build`, Portainer **rebuild** au sync |

Sans GitOps : tu cliques **Pull and redeploy** / **Update the stack** à la main après chaque push.

### 2.9 Environment variables

1. Mode **Advanced**.
2. Coller la sortie de `make portainer-env`.
3. Ajouter / vérifier :

```bash
NPM_NETWORK=nginx-proxy-manager_default
# ↑ remplace par le nom EXACT (Portainer → Networks — même réseau que Nextcloud / NPM)
```

Autres clés critiques (déjà dans `.env.prod` si `make env-prod` OK) :

| Variable | Exemple |
|----------|---------|
| `CLOUDITY_PUBLIC_HOST` | `cloudity.delhomme.ovh` |
| `CLOUDITY_PUBLIC_API_HOST` | `api.cloudity.delhomme.ovh` |
| `CLOUDITY_PUBLIC_PROTO` | `https` |
| `CLOUDITY_PUBLIC_OMIT_PORTS` | `true` |
| `VITE_API_URL` | `https://api.cloudity.delhomme.ovh` |
| `CLOUDITY_MOBILE_GATEWAY_URL` | `https://api.cloudity.delhomme.ovh` |
| `CORS_ORIGINS` | `https://cloudity.delhomme.ovh` |
| `CORS_ALLOW_LAN` | `false` |
| `JWT_SECRET` / Postgres / Redis | secrets forts |

Modèle commenté : [../../deploy/portainer/stack.env.example](../../deploy/portainer/stack.env.example).

### 2.10 Deploy

Cliquer **Deploy the stack**.

- **Premier** déploiement = long (build de tous les services sur le VPS).
- Surveiller **Logs** : `cloudity-db-migrate` doit finir OK.
- Conteneurs `cloudity-web` et `cloudity-api-gateway` doivent être **Running**.

---

## 3. Après Deploy — NPM (sinon 502)

Même si le certificat LE est déjà vert :

| Domain Names | Scheme | Forward Hostname / IP | Forward Port | SSL |
|--------------|--------|------------------------|--------------|-----|
| `cloudity.delhomme.ovh` | `http` | **`cloudity-web`** | **3000** | Force SSL + LE |
| `api.cloudity.delhomme.ovh` | `http` | **`cloudity-api-gateway`** | **8000** | Force SSL + LE |

**Pas** `cloudity:80`. **Pas** l’IP seule sur le port 80.

Les deux conteneurs doivent être sur le **même réseau Docker** que NPM (`NPM_NETWORK`).  
Le compose prod attache déjà web + gateway à `npm_edge` (external).

Puis :

```bash
make h14-https-check
# attendu : WEB 200 · API /health 200 · CORS Allow-Origin = https://cloudity.delhomme.ovh
```

---

## 4. Checklist « c’est bon »

- [ ] Stack créée (Git) avec Compose path correct
- [ ] Additional paths au moins `docker-compose.yml` + `docker-compose.prod.yml`
- [ ] Auth GitHub (PAT) OK si repo privé
- [ ] Env collé + `NPM_NETWORK` exact
- [ ] Deploy terminé, migrate OK
- [ ] NPM forwards `cloudity-web:3000` + `cloudity-api-gateway:8000`
- [ ] `make h14-https-check` vert
- [ ] Login web `https://cloudity.delhomme.ovh` + admin `/4dm1n`
- [ ] Mobile : `make run-mobile APP=Mail` avec gateway HTTPS

---

## 5. Mettre à jour ensuite (sans tout refaire)

| Tu changes… | Action |
|-------------|--------|
| Code sur `dev` / `main` | Push → GitOps poll **ou** Portainer → Update the stack |
| Un seul backend | Local : `make deploy-gateway` etc. · VPS : recreer **ce** conteneur (voir [DEPLOIEMENT-PAR-SERVICE.md](DEPLOIEMENT-PAR-SERVICE.md)) |
| Seulement les env | Éditer Env de la stack → Update (pas besoin de rebuild tout si image inchangée) |
| NPM seulement | Éditer Proxy Host — pas de redeploy stack |

Mobile / APK : **jamais** via Portainer → [MOBILES.md](../produit/MOBILES.md) · `make android-help`.

---

## 6. Trouver le nom du réseau NPM

1. Portainer → **Networks**.
2. Cherche le réseau joint par le conteneur **nginx-proxy-manager** (ou `npm`).
3. Exemples courants : `nginx-proxy-manager_default`, `npm_network`, `shared-network-copy`.
4. Même réseau que **Nextcloud** → copie ce nom dans `NPM_NETWORK=…`.

---

## 7. Versionnage — où regarder

| Quoi | Où |
|------|-----|
| Libs partagées SemVer + CI | [../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md) · `make check-versioning` |
| Toutes les couches (Go, npm, Flutter, images) | [VERSIONS-PROJET.md](VERSIONS-PROJET.md) |
| Tags d’images GHCR (futur / partiel) | [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md) § registry |
| Branches feat/dev/main | [BRANCHES.md](BRANCHES.md) |

La stack Git actuelle build **depuis le code** (`pull_policy: build`).  
Le versionnage « image `ghcr.io/...:vX.Y.Z` » est le mode alternatif (§ 8.3) quand les workflows publish sont utilisés.

---

## 8. Alternatives au mode Git + build sur VPS

### 8.1 Web editor

- Coller un compose unique (sans `include`) généré à la main.
- **Moins** maintenable ; utile en urgence.
- Secrets toujours en Env Portainer.

### 8.2 Compose path « aplati » (sans Additional paths lourds)

Créer un jour un `deploy/portainer/docker-compose.stack.flat.yml` qui inline tout (gros fichier).  
Aujourd’hui : **non** — on garde `include:` + Additional paths.

### 8.3 Images prébuild (GHCR) — sans build sur le VPS

1. CI publie `ghcr.io/<owner>/cloudity-<service>:<tag>`.
2. Compose Portainer : `image:` au lieu de `build:`.
3. Auth registry Portainer (PAT `read:packages`).
4. Update = changer `TAG=` + Pull.

Doc : [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md).

### 8.4 Plusieurs stacks (identité / mail / drive…)

Possible plus tard pour isoler les redéploiements.  
**Pour le premier go-live** : **une** stack `cloudity-stack` (ce guide).

### 8.5 ZoneForge

Cible long terme (publish + env sans coller à la main) : [ZONEFORGE-CLOUDITY.md](ZONEFORGE-CLOUDITY.md).  
Ce guide reste le fallback manuel.

---

## 9. Dépannage rapide

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| Deploy Git « authentication failed » | PAT manquant / scope | Nouveau PAT `repo`, re-saisir Auth |
| Deploy « compose file not found » | Mauvais Compose path | `deploy/portainer/docker-compose.stack.yml` |
| Build « file not found » include | Clone incomplet / mauvaise ref | Vérifier `refs/heads/dev` ou `main` existe sur GitHub |
| Conteneurs up mais **502** NPM | Forward host/port faux | `cloudity-web:3000` / `cloudity-api-gateway:8000` |
| 502 + bons introuvables | Pas sur réseau NPM | `NPM_NETWORK` + recreate web/gateway |
| CORS KO | `CORS_ORIGINS` | Doit être exactement `https://cloudity.delhomme.ovh` (sans `/`) |
| GitOps ne redéploie pas | Additional paths trop maigres | Ajouter `backend/` `frontend/` |

---

## 10. Fichiers du dépôt (carte)

```text
deploy/portainer/
  README.md                      ← index court
  PORTAINER-STACK.md             ← résumé formulaire
  docker-compose.stack.yml       ← entrée PROD (include + réseau NPM)
  docker-compose.stack-dev.yml   ← entrée DEV
  stack.env.example              ← modèle variables (sans secrets)

docker-compose.yml               ← services (dev/prod base)
docker-compose.prod.yml          ← overrides prod

docs/operations/
  PORTAINER-STACK-GIT-COMPLET.md ← CE FICHIER
  VERSIONS-PROJET.md             ← versions libs + services
```

---

*Dernière màj : 2026-07-29 — aligné H14 delhomme (DNS/LE OK, stack + forwards NPM à finaliser).*
