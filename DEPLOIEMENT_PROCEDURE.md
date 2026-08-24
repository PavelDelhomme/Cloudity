# Cloudity — Procédure de déploiement (unique)

**Fichier unique** pour Portainer, Git, NPM, environnements, mises à jour totales / partielles, et reprise de contrôle.

> Les anciens guides (`PORTAINER-*.md`, `DEPLOIEMENT-VPS-*.md`, `DEPLOY.md`, etc.) sont des **stubs** qui pointent ici. Ne les enrichis plus.

**Architecture & restructure** (pourquoi `web-mail`, catégories backend, phases) :  
→ [`docs/architecture/STRUCTURE-CIBLE.md`](docs/architecture/STRUCTURE-CIBLE.md)

**Formulaire Portainer court** :  
→ [`deploy/portainer/PORTAINER-FORMULAIRE-GIT.md`](deploy/portainer/PORTAINER-FORMULAIRE-GIT.md)

---

## A. Ordre de priorité (ne pas inverser)

```text
1. Restructurer le monorepo (base commune web/mobile/backend)
2. Adapter les apps pour déployer par bloc
3. Stacks Portainer Git : cloudity-preprod + cloudity (Total control)
4. Admin « hold / promote » versions + OTA mobile
```

Aujourd’hui on est entre **1** (doc + conventions) et **3** (stack encore Limited sur le VPS).

### A.1 `cloudity-web` vs `web-mail` (en 20 s)

| | |
|--|--|
| **`cloudity-web`** | Shell (login, hub) **+ encore** Drive/Pass/Photos/Office dedans |
| **`web-mail`** | App Mail **déjà sortie** — même modèle pour les prochaines apps |
| **Image prod** | Une image `cloudity-frontend` qui **assemble** shell + bundles (mail, …) |

### A.2 Plateforme vs produit (backend)

- **Plateforme** (touche tout) : `api-gateway`, `auth-service`, `admin-service`, `mail-directory-service`, `internalsec`
- **Produit** (par app) : calendar, contacts, drive, notes, passwords, photos, tasks  
Clients → **gateway uniquement**.

### A.3 Environnements

| Env | Branche | Stack Portainer | Tag |
|-----|---------|-----------------|-----|
| local | `feat/*` | — (`make up`) | — |
| preprod | `preprod` | `cloudity-preprod` | `preprod` |
| prod | `prod` | `cloudity` | `latest` |

Mobile : APKs pointent vers l’API de l’env (`localhost` / preprod / `api.cloudity.…`) ; distribution via URL/manifeste OTA.

### A.4 Admin — déployer / mettre en attente (objectif)

UI `/4dm1n` + `mobile/admin_app` devra :

1. Lister versions (images GHCR + APK)
2. **Hold** une release (staging)
3. **Promote** preprod → prod
4. Publier OTA mobile

Socle déjà partiel (manifestes APK, Watchtower, GitOps). Branchement admin = phase P6 de `STRUCTURE-CIBLE.md`.

---

## 0. Lire ça d’abord (état réel VPS Contabo)

| Fait | Détail |
|------|--------|
| **Pourquoi « Control = Limited » ?** | La stack a été démarrée **hors Portainer** : `docker compose` depuis le VPS. Portainer **voit** les conteneurs mais ne peut pas les éditer / redeployer comme une stack Git. |
| **Où ça a été créé ?** | Sur le VPS : **`/tmp/cloudity-build`** |
| | Projet Compose : **`cloudity-build`** |
| | Fichier : `/tmp/cloudity-build/docker-compose.ghcr.yml` |
| | Env : `/tmp/cloudity-build/.env` (copie de `stack.env`) |
| | Commande historique : `cd /tmp/cloudity-build && docker compose -f docker-compose.ghcr.yml --env-file .env up -d` |
| **`cloudity-db-migrate` = exited** | **Normal.** Job one-shot (`restart: "no"`). `Exited (0)` + log `[migrate] Terminé.` = migrations OK. Ce n’est **pas** un crash. |
| **Volumes à conserver** | `cloudity_postgres_data`, `cloudity_redis_data`, `cloudity_auth_keys`, `cloudity_mobile_data` (noms **explicites** dans le compose → survivront au passage Portainer). |
| **Réseaux** | Interne : `cloudity-data` · Edge NPM : `shared-network-copy` (et parfois `nginx-proxy-manager_npm-network`) |
| **Tentatives Portainer Git échouées** | Clones vides sous `/data/compose/22`, `23`, `24` (anciens bind mounts `scripts/` / `init/` vides) — à ignorer une fois la stack Git correcte créée. |

### Objectif cible

| Avant (aujourd’hui) | Après (Total control) |
|---------------------|------------------------|
| Nom Portainer : `cloudity-build` · Control **Limited** | Nom Portainer : **`cloudity`** · Control **Total** · Build method **Repository** |
| Source : `/tmp/cloudity-build` | Source : GitHub `refs/heads/prod` + `docker-compose.ghcr.yml` |
| Màj : SSH manuel | Màj : GitOps Portainer +/ou Watchtower +/ou Pull & Redeploy |

---

## 1. Architecture prod (une phrase)

```
Internet
  → NPM (TLS) → cloudity-web:80          (SPA /app/*)
  → NPM (TLS) → cloudity-api-gateway:8000 (toute l’API)
  → gateway (réseau cloudity-data) → auth, mail, pass, drive, photos, …
```

- **Un** front (`cloudity-frontend` / conteneur `cloudity-web`).
- **Une** API publique (`api.cloudity.delhomme.ovh`).
- Les microservices **ne sont pas** exposés sur NPM.
- Mobile / extension → uniquement `https://api.cloudity.delhomme.ovh`.

Domaines actuels :

| FQDN | Forward NPM | Port | Scheme |
|------|-------------|------|--------|
| `cloudity.delhomme.ovh` (+ apps optionnels) | `cloudity-web` | `80` | **http** (pas https vers le conteneur) |
| `api.cloudity.delhomme.ovh` | `cloudity-api-gateway` | `8000` | **http** |

`REGISTRY_OWNER=paveldelhomme` (minuscules). `NPM_NETWORK=shared-network-copy`.

---

## 2. Environnements

| Env | Où | Branche | Tag image | Accès |
|-----|-----|---------|-----------|--------|
| **Local** | PC `make up` / `make up-lean` | `feat/*` | build local | `http://localhost:6001` · API `:6002` |
| **Prod** | VPS Portainer stack `cloudity` | `prod` | `latest` | `https://cloudity.delhomme.ovh` |
| **Préprod** (optionnel) | stack `cloudity-dev` | `dev` | `dev` | sous-domaine dédié |

Secrets : **jamais** dans Git. Fichier local gitignored : `deploy/portainer/stack.env`.

```bash
# Sur le PC, depuis la racine du repo
make portainer-prod-env DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh \
  API_HOST=api.cloudity.delhomme.ovh NPM_NETWORK=shared-network-copy \
  REGISTRY_OWNER=paveldelhomme
# → deploy/portainer/stack.env
```

---

## 3. Reprendre le contrôle Total dans Portainer (migration Limited → Git)

**But** : remplacer la stack SSH `cloudity-build` par une stack Portainer `cloudity` **sans perdre la base**.

### 3.1 Préparer l’env (PC)

1. Générer / vérifier `deploy/portainer/stack.env` (§ 2).
2. Vérifier au minimum :
   ```
   REGISTRY_OWNER=paveldelhomme
   TAG=latest
   NPM_NETWORK=shared-network-copy
   ```
3. Copier le contenu dans le presse-papiers (pour Portainer → Environment variables).

### 3.2 Arrêter la stack SSH **sans** supprimer les volumes

Sur le VPS (`cnx_srv` / `ssh pavel-server`) :

```bash
cd /tmp/cloudity-build
docker compose -f docker-compose.ghcr.yml --env-file .env down
# ❌ NE PAS mettre -v  → garder postgres / redis / auth_keys
```

Vérifier :

```bash
docker volume ls | grep cloudity
# doit encore lister : cloudity_postgres_data cloudity_redis_data cloudity_auth_keys cloudity_mobile_data
docker ps -a --filter name=cloudity   # plus de conteneurs (ou seulement exited migrate)
```

### 3.3 Créer la stack Portainer (Total)

Portainer → **Stacks** → **Add stack** :

| Champ | Valeur exacte |
|-------|----------------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `docker-compose.ghcr.yml` *(racine du dépôt — pas `deploy/portainer/…`)* |
| **Additional paths** | *(vide)* |
| **Authentication** | OFF si repo public |
| **Environment variables** | coller `stack.env` |
| **GitOps updates** | **ON** (recommandé) |
| **Fetch interval** | ex. `5m` |
| **Re-pull image and redeploy** | **ON** |
| **Prune** | OFF |

**Deploy the stack.**

### 3.4 Succès si

1. Control = **Total** sur la stack `cloudity`.
2. `cloudity-db-migrate` → **Exited (0)** · logs `[migrate] Terminé.`
3. `cloudity-auth-service` + `cloudity-api-gateway` → **healthy**.
4. `cloudity-web` → running, joint à `shared-network-copy`.
5. `curl -sf https://api.cloudity.delhomme.ovh/health` → `{"status":"healthy"}`.
6. `curl -sfI https://cloudity.delhomme.ovh/` → HTTP 200.

### 3.5 Si JWT 401 après migration

Volume `cloudity_auth_keys` doit être writable par UID **65532** (nonroot). Le compose inclut un service `auth-keys-init` ; sinon une fois :

```bash
docker run --rm -v cloudity_auth_keys:/keys alpine:3.20 \
  sh -c 'chown -R 65532:65532 /keys && chmod 700 /keys'
docker restart cloudity-auth-service cloudity-api-gateway
```

### 3.6 Nettoyage après succès

```bash
# Optionnel : supprimer le clone SSH (les volumes Docker restent)
rm -rf /tmp/cloudity-build
# Dans Portainer : si une vieille entrée « cloudity-build » Limited reste orpheline, la supprimer (containers déjà down).
```

### 3.7 Première install (volumes vides) — seulement si tu acceptes une DB neuve

```bash
docker rm -f $(docker ps -aq --filter name=cloudity) 2>/dev/null || true
docker volume rm cloudity_postgres_data cloudity_redis_data cloudity_auth_keys cloudity_mobile_data 2>/dev/null || true
docker network rm cloudity-data 2>/dev/null || true
```

Puis § 3.3. **Ne pas** faire ça pour la migration Limited → Total actuelle.

---

## 4. NPM (Nginx Proxy Manager)

1. Conteneurs `cloudity-web` et `cloudity-api-gateway` sur le **même** réseau Docker que NPM (`NPM_NETWORK=shared-network-copy`).
2. Proxy Hosts :

| Domain Names | Forward hostname | Port | Scheme |
|--------------|------------------|------|--------|
| `cloudity.delhomme.ovh` | `cloudity-web` | 80 | **http** |
| `api.cloudity.delhomme.ovh` | `cloudity-api-gateway` | 8000 | **http** |

3. SSL Let’s Encrypt + Force SSL + Websockets ON (côté public).
4. **Piège déjà vu** : `forward_scheme=https` vers le conteneur HTTP → **502**. Corriger en **http** dans l’UI NPM (Save) ; un `UPDATE` SQL seul ne régénère pas toujours le `.conf` nginx.

Smoke :

```bash
make h14-https-check
# ou
curl -sf https://api.cloudity.delhomme.ovh/health
curl -sfI https://cloudity.delhomme.ovh/
```

---

## 5. Déployer / mettre à jour

### 5.1 Toute la stack

| Méthode | Comment |
|---------|---------|
| **A. GitOps Portainer** | Push sur `prod` → Portainer refetch compose + pull images (si GitOps ON). |
| **B. GHCR + Watchtower** | Labels `com.centurylinklabs.watchtower.enable=true` sur les services → pull périodique des tags. |
| **C. Manuel Portainer** | Stack `cloudity` → **Pull and redeploy**. |
| **D. CI** | `make publish-ghcr` / workflow `Docker — build & publish (GHCR)` sur branche `prod`. |

Flux recommandé quotidien :

```text
dev → merge → git push origin prod
  → GitHub Actions build/push ghcr.io/paveldelhomme/cloudity-*:latest
  → Portainer GitOps et/ou Watchtower redeploy
  → make h14-https-check
```

Depuis le PC :

```bash
make push-prod DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh \
  API_HOST=api.cloudity.delhomme.ovh FORCE=1 WAIT=1
```

### 5.2 Un seul service (partiel)

Sans toucher au reste :

1. Rebuild/push **une** image GHCR (workflow ou build local tagué).
2. Portainer → stack `cloudity` → conteneur concerné → **Recreate** / Pull image,  
   **ou** sur le VPS :
   ```bash
   docker pull ghcr.io/paveldelhomme/cloudity-drive-service:latest
   docker compose -f /chemin/portainer/compose/... up -d drive-service
   # Plus simple : Portainer UI → Recreate ce service uniquement
   ```
3. Si schéma SQL nouveau : attendre que `db-migrate` soit relancé (redeploy stack ou one-shot) **avant** le service.

Équivalent **local** :

| Besoin | Commande |
|--------|----------|
| Front | `make deploy-web` |
| Gateway | `make deploy-gateway` |
| Auth | `make deploy-auth` |
| Mail | `make deploy-mail` |
| Pass | `make deploy-pass` |
| Drive / Photos | `make deploy-drive` / `make deploy-photos` |
| Un service Go | `make deploy-service SERVICE=contacts-service` |
| Migrations | `make migrate` |

### 5.3 Mobile

Hors Docker. APKs pointent vers `https://api.cloudity.delhomme.ovh` :

```bash
export PATH="$HOME/.local/flutter/bin:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
export CLOUDITY_MOBILE_GATEWAY_URL=https://api.cloudity.delhomme.ovh
APP=Pass make mobile-publish   # idem Mail|Drive|Photos
adb -s <SERIAL_NOTHING> install -r dist/mobile-apk/cloudity_pass-0.1.0.apk
```

### 5.4 Stack Mail MTA (alias) — séparée

Compose : `deploy/mail-mta/` · stack Portainer **distincte** (ports 25/587).  
Local : `make mail-mta-local-up` · `make test-mail-mta-local`.  
DNS MX/SPF/DKIM : hors de la stack web (voir docs mail-alias si besoin).

---

## 6. Formulaire Git Portainer — anti-pièges

| Champ | Bon | Mauvais |
|-------|-----|---------|
| Compose path | `docker-compose.ghcr.yml` | `deploy/portainer/docker-compose.ghcr.yml` |
| `db-migrate` | image `cloudity-db-migrate` (scripts baked) | bind mount `./scripts` → **vides** sous `/data/compose/N` |
| `REGISTRY_OWNER` | `paveldelhomme` | `PavelDelhomme` |
| `NPM_NETWORK` | `shared-network-copy` | mauvais nom → 502 NPM |
| Champs vides | laisser vides `CORS_ORIGINS_EXTRA`, `WEBAUTHN_ORIGINS_EXTRA`, `MTLS_ALLOWED_PEERS` | coller `e.g. bar` |
| Contrôle | Créer **dans** Portainer (Repository) | `docker compose` SSH → **Limited** |
| Volumes | `name: cloudity_*` explicites | laisser Compose préfixer par le nom de projet |

---

## 7. Checklist ops

### Après chaque déploiement

- [ ] `cloudity-db-migrate` Exited **0**
- [ ] gateway + auth **healthy**
- [ ] `make h14-https-check` (ou curls web/API)
- [ ] Login seed admin OK (JWT valide — clés auth présentes)

### Rollback images

Portainer → stack → changer `TAG` (ou digest) → Pull and redeploy.  
Ou Watchtower désactivé + `docker pull …:<ancien-tag>` + recreate.

### Backup DB (minimal)

```bash
docker exec cloudity-postgres pg_dump -U cloudity_admin cloudity | gzip > cloudity-$(date +%F).sql.gz
```

---

## 8. Local vs prod (rappel)

| | Local | Prod |
|--|-------|------|
| Orchestrateur | Docker Compose racine | Portainer Git `docker-compose.ghcr.yml` |
| Secrets | `.env` | Portainer env / `stack.env` |
| TLS | non | NPM Let’s Encrypt |
| Ports | 6001 / 6002 | 80/443 publics uniquement via NPM |
| Màj | `make deploy-*` | GitOps / Watchtower / Pull |

---

## 9. Commandes VPS utiles

```bash
# Où tourne la stack actuelle (labels)
docker inspect cloudity-api-gateway --format \
  'project={{index .Config.Labels "com.docker.compose.project"}} dir={{index .Config.Labels "com.docker.compose.project.working_dir"}}'

# Santé
docker ps --filter name=cloudity --format 'table {{.Names}}\t{{.Status}}'
docker logs cloudity-db-migrate --tail 20

# Réseau NPM
docker network inspect shared-network-copy --format '{{range .Containers}}{{.Name}} {{end}}'
```

---

## 10. Résumé « quoi faire maintenant »

1. **Comprendre** : Limited = stack créée dans **`/tmp/cloudity-build`** ; migrate exited = OK.
2. **Migrer** : § 3 (`compose down` sans `-v` → Add stack Git `cloudity` → Deploy).
3. **Vérifier** NPM scheme **http** + smoke HTTPS.
4. **Ensuite** : push `prod` + GitOps/Watchtower pour les màj ; § 5.2 pour un seul service.

Tout le reste (MTA, mobile, Office) s’appuie sur cette stack `cloudity` stable avec **Total** control.
