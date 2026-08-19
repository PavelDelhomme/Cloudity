# Installation Portainer PROD — Cloudity (guide complet)

Guide pas à pas pour ton VPS (`95.111.227.204`), domaine **`delhomme.ovh`**, NPM + Portainer Git.

> **Tu utilises Portainer en mode Repository (Git)** — c’est le bon choix. Ne colle **pas** le YAML en Web editor seul (service `db-migrate` a besoin des fichiers `scripts/` du dépôt).

---

## Sommaire

0. [Comprendre l’architecture (lis ça d’abord)](#0-comprendre-larchitecture)
1. [DNS OVH — quoi créer exactement](#1-dns-ovh)
2. [Nginx Proxy Manager — proxy obligatoires + optionnels](#2-nginx-proxy-manager)
3. [Réseau Docker NPM](#3-réseau-docker)
4. [Générer les secrets et variables Portainer](#4-secrets-et-variables-portainer)
5. [Créer la stack Portainer `cloudity` (Git) — étape par étape](#5-stack-portainer-git)
6. [Watchtower + publication GHCR](#6-watchtower--ghcr)
7. [Stack Mail MTA (alias mail — séparée)](#7-stack-mail-mta)
8. [Mobile, extension Pass, admin](#8-mobile-extension-pass-admin)
9. [Mettre à jour un service individuellement](#9-mise-à-jour-par-service)
10. [Vérification et dépannage](#10-vérification)

---

## 0. Comprendre l’architecture

### Ce que Cloudity est (et n’est pas)

Cloudity **n’est pas** « un sous-domaine = un conteneur backend » pour chaque app.

| Composant | Réalité prod |
|-----------|--------------|
| **Frontend web** | **Une seule image** `cloudity-frontend` (nginx) = shell SPA + routes `/app/*` |
| **Mail web** | Build séparé (`web-mail`) mais **copié dans la même image** sous `/app/mail/` |
| **Drive, Pass, Calendar, Notes, Tasks, Contacts, Photos, Office** | Modules **dans** `cloudity-web` (routes React), **pas** de conteneur front chacun |
| **API publique** | **Une seule entrée** : `api.cloudity.delhomme.ovh` → `api-gateway` |
| **auth-service, mail-directory, passwords, drive, photos…** | **Internes** — jamais exposés sur Internet ; le gateway route `/auth`, `/mail`, `/pass`, `/drive`… |
| **Apps mobile** | APK Flutter séparées — parlent **uniquement** à `https://api.cloudity.delhomme.ovh` |
| **Extension Pass navigateur** | Build Chrome/Firefox local — API = gateway HTTPS |

### Schéma simplifié

```
Navigateur / Mobile
        │
        ├── https://cloudity.delhomme.ovh          ──► cloudity-web:80  (SPA /app/drive, /app/pass…)
        ├── https://mail.cloudity.delhomme.ovh   ──► cloudity-web:80  (optionnel, même conteneur)
        ├── https://admin.cloudity.delhomme.ovh  ──► cloudity-web:80  (/4dm1n)
        └── https://api.cloudity.delhomme.ovh    ──► api-gateway:8000 (TOUTE l’API)

api-gateway (interne) ──► auth-service, mail-directory, passwords, drive, photos, calendar, notes, tasks, contacts, admin
```

### Correspondance app ↔ URL web ↔ API

| App | URL web (dans le shell) | Sous-domaine optionnel (bookmark) | Backend (interne, via gateway) |
|-----|-------------------------|-----------------------------------|--------------------------------|
| Hub | `https://cloudity…/app` | — | gateway |
| Mail | `https://cloudity…/app/mail` | `mail.cloudity…` | `mail-directory-service` |
| Drive | `https://cloudity…/app/drive` | `drive.cloudity…` | `drive-service` |
| Pass | `https://cloudity…/app/pass` | `pass.cloudity…` | `passwords-service` |
| Calendar | `https://cloudity…/app/calendar` | `calendar.cloudity…` | `calendar-service` |
| Notes | `https://cloudity…/app/notes` | `notes.cloudity…` | `notes-service` |
| Tasks | `https://cloudity…/app/tasks` | `tasks.cloudity…` | `tasks-service` |
| Contacts | `https://cloudity…/app/contacts` | `contacts.cloudity…` | `contacts-service` |
| Photos | `https://cloudity…/app/photos` | `photos.cloudity…` | `photos-service` |
| Office | `https://cloudity…/app/office` | `office.cloudity…` | gateway (+ services) |
| Admin | `https://admin.cloudity…/4dm1n` | `admin.cloudity…` | gateway + `admin-service` |
| Auth (login) | `https://cloudity…/login` | ❌ pas de `auth.cloudity…` en prod | gateway → `auth-service` |

**Tu n’as pas besoin** d’exposer `auth-service`, `mail-directory-service`, `passwords-service` sur NPM.

### Dossiers du projet (à quoi ils servent)

| Dossier | Rôle | Déployé sur VPS ? |
|---------|------|-------------------|
| `frontend/apps/cloudity-web` | Shell SPA + pages Drive/Pass/… | ✅ image `cloudity-frontend` |
| `frontend/apps/web-mail` | SPA Mail (bundle dans la même image) | ✅ (dans `cloudity-frontend`) |
| `frontend/packages/*` | Libs partagées (UI, crypto Pass/vault) | ✅ compilées dans le front |
| `backend/*-service` | Microservices Go/Python | ✅ images GHCR séparées |
| `mobile/*` | Apps Flutter (Mail, Drive, Photos, Pass…) | ❌ APK sideload / Play plus tard |
| `mobile/cloudity_shared` | Code Dart partagé mobile | ❌ (dans l’APK) |
| `mobile/admin_app` | App admin mobile | ❌ APK séparée |
| `deploy/portainer/` | Compose prod Portainer | ✅ config stack |
| `deploy/mail-mta/` | Serveur mail entrant (alias `@alias.domain`) | ✅ **stack Portainer séparée** |
| `infrastructure/` | Migrations SQL, nginx exemples, PKI | ✅ migrations via `db-migrate` |

**Deux packages crypto front** : `pass-crypto` (extension + Pass web) et `app-vault-crypto` (coffre générique) — normal, rôles différents.

---

## 1. DNS OVH

### Type d’enregistrement : **A** (pas « Redirection »)

Dans OVH → Zone DNS `delhomme.ovh` :

- Utilise **« Enregistrement A »** (ou sous-domaine → **A** vers `95.111.227.204`)
- **Ne pas** utiliser « Redirection web » OVH pour les apps (ça casse SSL/NPM)

TTL : 300 ou 3600 (défaut OK).

### Enregistrements obligatoires (minimum prod)

| Sous-domaine | Type | Cible | Rôle |
|--------------|------|-------|------|
| `cloudity.delhomme.ovh` | **A** | `95.111.227.204` | Shell web principal |
| `api.cloudity.delhomme.ovh` | **A** | `95.111.227.204` | API gateway |
| `admin.cloudity.delhomme.ovh` | **A** | `95.111.227.204` | Interface admin |

### Enregistrements optionnels (bookmarks — même serveur)

Tous en **A** → `95.111.227.204` :

| Sous-domaine | Type | Note |
|--------------|------|------|
| `mail.cloudity.delhomme.ovh` | **A** | → NPM → `cloudity-web:80` |
| `mails.cloudity.delhomme.ovh` | **A** | → NPM redirect vers `mail.cloudity…` (voir §2) |
| `drive.cloudity.delhomme.ovh` | **A** | bookmark Drive |
| `pass.cloudity.delhomme.ovh` | **A** | bookmark Pass |
| `calendar.cloudity.delhomme.ovh` | **A** | bookmark Calendar |
| `notes.cloudity.delhomme.ovh` | **A** | bookmark Notes |
| `tasks.cloudity.delhomme.ovh` | **A** | bookmark Tasks |
| `contacts.cloudity.delhomme.ovh` | **A** | bookmark Contacts |
| `photos.cloudity.delhomme.ovh` | **A** | bookmark Photos |
| `office.cloudity.delhomme.ovh` | **A** | bookmark Office |

**Pas besoin** de DNS pour : `auth.cloudity`, `mail-directory`, `passwords-service` (internes).

---

## 2 bis. NPM — ta config actuelle (cloudity.delhomme.ovh)

### HTTPS partout

NPM termine le HTTPS (Let's Encrypt). Vers les conteneurs tu laisses **`http`** (pas https) :

| Vers conteneur | Scheme NPM | SSL onglet |
|----------------|------------|------------|
| `cloudity-web:80` | **http** | ✅ Request SSL + Force SSL |
| `cloudity-api-gateway:8000` | **http** | ✅ Request SSL + Force SSL |

L'utilisateur voit `https://cloudity.delhomme.ovh` — NPM déchiffre et parle en HTTP au conteneur.

### Corriger le proxy `cloudity:80`

| Champ | Valeur |
|-------|--------|
| Domain Names | voir ci-dessous |
| Scheme | `http` |
| Forward hostname | **`cloudity-web`** (pas `cloudity`) |
| Forward port | **`80`** |
| SSL | Let's Encrypt + **Force SSL** + HTTP/2 |

### ⚠️ Ne mets PAS `api.cloudity…` dans le proxy web

| Domaine | Proxy NPM séparé ? | Forward |
|---------|-------------------|---------|
| `api.cloudity.delhomme.ovh` | **Oui — proxy dédié** | `cloudity-api-gateway:8000` |
| `cloudity.delhomme.ovh` | Proxy web #1 | `cloudity-web:80` |
| `admin`, `mail`, `drive`, `pass`, … | **Même proxy web** (Domain Names multiples) | `cloudity-web:80` |

Dans **un seul** Proxy Host web, tu peux lister tous les domaines front :

```
cloudity.delhomme.ovh
admin.cloudity.delhomme.ovh
mail.cloudity.delhomme.ovh
drive.cloudity.delhomme.ovh
pass.cloudity.delhomme.ovh
calendar.cloudity.delhomme.ovh
notes.cloudity.delhomme.ovh
tasks.cloudity.delhomme.ovh
contacts.cloudity.delhomme.ovh
photos.cloudity.delhomme.ovh
office.cloudity.delhomme.ovh
```

Puis **Advanced** (optionnel) — rediriger vers la bonne app :

```nginx
# mail.cloudity… → ouvre Mail directement
if ($host = "mail.cloudity.delhomme.ovh") {
  return 302 https://cloudity.delhomme.ovh/app/mail$is_args$args;
}
# drive.cloudity…
if ($host = "drive.cloudity.delhomme.ovh") {
  return 302 https://cloudity.delhomme.ovh/app/drive$is_args$args;
}
# (idem pass → /app/pass, calendar → /app/calendar, etc.)
```

### Redirections typo (`d.cloudity`, `m.cloudity`, `mails`…)

**Pas encore dans l'admin Cloudity** — c'est une évolution prévue (API NPM + DNS OVH). Pour l'instant :

- **`mails.cloudity…`** → NPM Advanced : `return 301 https://mail.cloudity.delhomme.ovh$request_uri;`
- Typos (`d.`, `m.`, `pa.`) → ajouter DNS A + même proxy web, ou redirects NPM manuels

### Proxy API (2ᵉ Proxy Host obligatoire)

| Champ | Valeur |
|-------|--------|
| Domain Names | `api.cloudity.delhomme.ovh` |
| Forward | `cloudity-api-gateway:8000` |
| SSL | Force SSL |
| Advanced | `client_max_body_size 200m;` |

---

## 4 bis. Fichier env pour Portainer (sans tout retaper)

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity
make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
```

Génère aussi **`deploy/portainer/stack.env`** (gitignored).

Dans Portainer → Stack → Environment variables :

- **Option A** : bouton **Load variables from file** → choisir `stack.env`
- **Option B** : coller le bloc stdout
- **Option C** : `scp deploy/portainer/stack.env user@95.111.227.204:/opt/cloudity/` puis référencer sur le VPS

⚠️ **Regénère les secrets** si tu les as collés dans un chat (`make portainer-prod-env` refait tout).

---

## 5 bis. Formulaire Portainer Git — valeurs exactes

| Champ Portainer | Valeur |
|-----------------|--------|
| **Name** | `cloudity` |
| **Build method** | Repository |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/feat/notes-google-keep` (puis `refs/heads/prod` quand branche prod créée) |
| **Compose path** | `deploy/portainer/docker-compose.ghcr.yml` |
| **Additional paths** | **vide** (rien à ajouter) |
| **Authentication** | GitHub username + PAT (`repo` scope) si repo privé |
| **Environment variables** | Load from `deploy/portainer/stack.env` |
| **GitOps** | ON (optionnel) |
| **Re-pull image** | ON |

**Additional paths** : seulement si tu avais des `include:` vers d'autres compose — pas le cas avec `docker-compose.ghcr.yml`.

---

## 5 ter. Auth / inscription (état actuel)

| Fonctionnalité | Statut |
|----------------|--------|
| Login web avec redirect `?next=/app/drive` | ✅ `RequireAuth` dans le shell SPA |
| Register API `POST /auth/register` | ✅ basique (email + password + tenant) |
| Validation email par lien | ❌ pas encore (compte actif immédiatement) |
| Mobile → browser inscription → retour app | ❌ deep link à implémenter |
| Force mot de passe (Have I Been Pwned) | ❌ backlog |
| Ouverture `drive.cloudity…` sans login | → redirect `/login?next=…` une fois stack up |

Le flux complet que tu décris est la **cible produit** — la base auth existe, l'email verification et mobile deep link viendront après la stack prod.

---

### Corriger ta config actuelle

| Proxy actuel | Problème | Action |
|--------------|----------|--------|
| `http://95.111.227.204:80` | IP brute | **Supprimer** |
| `http://cloudity:80` | mauvais nom (`cloudity` ≠ `cloudity-web`) | **Corriger** ou recréer |

> L’image front nginx écoute sur le port **80** (pas 3000). Forward port = **80**.

### A. Proxies obligatoires

#### 1) Web principal

| Champ NPM | Valeur |
|-----------|--------|
| Domain names | `cloudity.delhomme.ovh` |
| Scheme | `http` |
| Forward hostname | `cloudity-web` |
| Forward port | **80** |
| Websockets | ON |
| Block Common Exploits | ON |
| SSL | Request new SSL → Let's Encrypt → Force SSL |

#### 2) API

| Champ NPM | Valeur |
|-----------|--------|
| Domain names | `api.cloudity.delhomme.ovh` |
| Forward hostname | `cloudity-api-gateway` |
| Forward port | **8000** |
| Websockets | ON |
| SSL | Let's Encrypt + Force SSL |
| Advanced | `client_max_body_size 200m;` |

#### 3) Admin

| Champ NPM | Valeur |
|-----------|--------|
| Domain names | `admin.cloudity.delhomme.ovh` |
| Forward hostname | `cloudity-web` |
| Forward port | **80** |
| SSL | Let's Encrypt + Force SSL |

### B. Proxies optionnels (sous-domaines apps)

Pour **chaque** sous-domaine app (`mail`, `drive`, `pass`, …) :

| Champ NPM | Valeur |
|-----------|--------|
| Domain names | ex. `mail.cloudity.delhomme.ovh` |
| Forward hostname | `cloudity-web` |
| Forward port | **80** |
| SSL | Let's Encrypt + Force SSL |

Le shell SPA gère les routes ; en prod tu peux ajouter une **Custom location** (Advanced) pour rediriger vers le bon chemin :

```nginx
# Exemple mail.cloudity… → ouvre directement Mail
return 302 https://cloudity.delhomme.ovh/app/mail$is_args$args;
```

Ou laisser le sous-domaine servir la même SPA (l’utilisateur navigue vers `/app/mail`).

### C. Redirection `mails` → `mail`

**Option 1 — NPM** (recommandé) : Proxy Host pour `mails.cloudity.delhomme.ovh` :

| Champ | Valeur |
|-------|--------|
| Forward | `cloudity-web:80` (ou dummy) |
| Advanced | `return 301 https://mail.cloudity.delhomme.ovh$request_uri;` |

**Option 2 — OVH** : Redirection permanente `mails.cloudity.delhomme.ovh` → `https://mail.cloudity.delhomme.ovh` (moins flexible pour SSL).

### D. CORS — si tu ajoutes des sous-domaines optionnels

Dans Portainer, étends `CORS_ORIGINS` :

```env
CORS_ORIGINS=https://cloudity.delhomme.ovh,https://admin.cloudity.delhomme.ovh,https://mail.cloudity.delhomme.ovh,https://drive.cloudity.delhomme.ovh,https://pass.cloudity.delhomme.ovh
```

(Idem pour `WEBAUTHN_ORIGINS` si passkeys sur ces hosts.)

---

## 3. Réseau Docker

Sur le VPS (SSH) :

```bash
docker network ls | grep -i nginx
```

Note le nom (souvent `nginx-proxy-manager_npm-network`).

Dans Portainer env : **`NPM_NETWORK=<nom exact>`**

La stack connecte `cloudity-web` et `cloudity-api-gateway` à ce réseau pour que NPM résolve les noms de conteneurs.

---

## 4. Secrets et variables Portainer

### Sur ton PC

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity

make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
```

Copie **tout** le bloc `KEY=VALUE` (90+ lignes).

### Variables critiques (compose refuse de démarrer sans)

| Variable | Génération |
|----------|------------|
| `REGISTRY_OWNER` | `PavelDelhomme` |
| `TAG` | `latest` |
| `NPM_NETWORK` | nom réseau NPM |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `REDIS_PASSWORD` | `openssl rand -hex 32` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `PERFORMANCE_INGEST_TOKEN` | `openssl rand -hex 32` |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | URLs https du front (voir §2.D) |

⛔ Ne réutilise **pas** les mots de passe dev (`cloudity_secure_password`, `Admin1234`).

Fichier local généré : `.env.prod` (gitignored).

---

## 5. Stack Portainer Git — étape par étape

### Étape 5.1 — Prérequis GitHub

1. Branche **`prod`** sur le repo (ou `main` en attendant) :
   ```bash
   git checkout -b prod
   git push -u origin prod
   ```
2. Images GHCR publiées (voir §6).
3. Si repo **privé** : GitHub → Settings → Developer settings → **Personal access token** (scope `repo`).

### Étape 5.2 — Portainer → Stacks → Add stack

| Champ | Valeur exacte |
|-------|---------------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `deploy/portainer/docker-compose.ghcr.yml` |
| **Authentication** | Username + token si repo privé |
| **Environment variables** | Mode **Advanced** → coller le bloc §4 |
| **GitOps updates** | ON (optionnel — pull auto ~5 min) |
| **Re-pull image** | ON |
| **Prune unused containers** | OFF |

### Étape 5.3 — Deploy the stack

1. Clique **Deploy the stack**.
2. Attends 5–15 min (pull 12 images GHCR + postgres + migrations).
3. Portainer → stack `cloudity` → **Logs** :
   - `cloudity-db-migrate` doit finir en **exited (0)**
   - `cloudity-auth-service` → healthy
   - `cloudity-api-gateway` → healthy

### Étape 5.4 — Ordre de démarrage (automatique dans le compose)

```
postgres → db-migrate → redis + microservices → auth → admin → gateway + web
```

### Étape 5.5 — Ce que fait `docker-compose.ghcr.yml`

| Service | Image GHCR | Exposé NPM ? |
|---------|------------|--------------|
| postgres, redis | docker hub | ❌ interne |
| db-migrate | postgres:15 (one-shot) | ❌ |
| auth-service | cloudity-auth-service | ❌ |
| admin-service | cloudity-admin-service | ❌ |
| passwords-service | cloudity-passwords-service | ❌ |
| mail-directory-service | cloudity-mail-directory-service | ❌ |
| calendar, notes, tasks, drive, contacts, photos | cloudity-*-service | ❌ |
| api-gateway | cloudity-api-gateway | ✅ via NPM |
| cloudity-web | cloudity-frontend | ✅ via NPM |

**Volumes à ne jamais supprimer** au redeploy : `cloudity_postgres_data`, `cloudity_redis_data`, `cloudity_auth_keys`.

---

## 6. Watchtower + GHCR

### Watchtower (stack séparée)

Portainer → Add stack → name `watchtower` → coller `deploy/watchtower-compose.yml` → Deploy.

### Publier / mettre à jour les images (depuis ton PC)

```bash
# Première fois
make push-prod REF=prod WAIT=1

# Promote dev → prod (style YTMusic)
make admin-deploy-prod

# Redeploy VPS après CI
make redeploy-vps
```

Watchtower pull `:latest` sous ~5 min sans toucher Portainer.

---

## 7. Stack Mail MTA (alias mail — séparée)

Les alias mail (`*@alias.maily.ovh`) utilisent une **stack Docker à part** :

| Élément | Chemin |
|---------|--------|
| Compose local test | `deploy/mail-mta/docker-compose.local.yml` |
| Compose VPS | `deploy/mail-mta/docker-compose.maddy.yml` |
| Doc | `docs/operations/MAIL-MTA-*.md` |

Ce n’est **pas** dans la stack `cloudity` principale. Variables liées dans Portainer cloudity : `MAIL_ALIAS_DOMAIN`, `MTA_INTERNAL_TOKEN`.

DNS mail entrant (MX) = sujet séparé (port 25/587 sur le VPS).

---

## 8. Mobile, extension Pass, admin

| Composant | Déploiement prod |
|-----------|------------------|
| **Apps mobile** (Mail, Drive, Photos, Pass…) | `make mobile-publish APP=Mail` → APK ; API = `https://api.cloudity.delhomme.ovh` |
| **admin_app** mobile | Flutter → `make run-mobile APP=Admin` ; même gateway |
| **Extension Pass** | Build local Chrome/Firefox ; voir docs Pass extension |
| **cloudity_auth_broker** (Android) | Partage session entre apps Cloudity sur le téléphone |

Les mobiles **ne passent pas** par les sous-domaines `mail.cloudity…` — uniquement l’API gateway.

---

## 9. Mise à jour par service

### Backend (un microservice changé)

**Prod VPS (stack mono GHCR)** :

1. Push code → `make push-prod REF=prod WAIT=1` (rebuild **toutes** les images)
2. Watchtower ou Portainer Pull and redeploy

**Futur multi-stack** (doc avancée) : bump `TAG=` d’**une** image seulement — voir `docs/operations/DEPLOIEMENT-PAR-SERVICE.md`.

### Frontend web (shell ou Mail)

Rebuild image `cloudity-frontend` → même flux GHCR.

### Mobile

Nouvelle APK + manifeste OTA — pas de conteneur VPS.

---

## 10. Vérification

```bash
# Depuis ton PC
make h14-https-check \
  WEB=https://cloudity.delhomme.ovh \
  API=https://api.cloudity.delhomme.ovh
```

```bash
# Sur le VPS
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep cloudity
curl -s https://api.cloudity.delhomme.ovh/health
curl -sI https://cloudity.delhomme.ovh | head -3
```

Première connexion admin : seed via variables `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (puis change le mot de passe).

---

## Dépannage

| Symptôme | Cause | Fix |
|----------|-------|-----|
| NPM 502 sur web | forward `cloudity:80` | `cloudity-web:80` |
| NPM 502 sur API | proxy manquant | `cloudity-api-gateway:8000` |
| db-migrate fail exit 2 / `users does not exist` | volume Postgres créé **sans** scripts `init/` (premier deploy) | fix compose (init monté) + **supprimer** le volume `cloudity_postgres_data` puis redeploy |
| db-migrate fail | Web editor sans Git | mode **Repository** |
| GHCR pull denied | packages privés | Public sur GitHub Packages |
| CORS browser | origine absente de `CORS_ORIGINS` | ajouter le sous-domaine |
| JWT invalidés | volume auth-keys supprimé | ne pas Remove volumes |
| Mail OAuth KO | redirect URI | `GOOGLE_OAUTH_REDIRECT_URI=https://api.cloudity…/mail/me/oauth/google/callback` |

---

## Commandes Make

```bash
make portainer-prod-env NPM_NETWORK=…   # bloc env Portainer
make deploy-hint                       # rappel rapide
make push-prod REF=prod WAIT=1         # CI GHCR
make admin-deploy-prod                 # dev → prod
make redeploy-vps                      # Portainer API / SSH
make mobile-publish APP=Mail           # APK OTA
```

Docs : [DEPLOY.md](../../DEPLOY.md) · [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md) · [DISTRIBUTION-CHANNELS.md](../../docs/operations/DISTRIBUTION-CHANNELS.md)
