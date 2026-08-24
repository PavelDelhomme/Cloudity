# Cloudity — Procédure de déploiement (unique)

**Fichier unique** pour Portainer, Git, NPM, environnements, mises à jour totales / partielles, et reprise de contrôle.

> Anciens fichiers `PORTAINER-*.md` / `DEPLOIEMENT-*.md` **supprimés** — tout est ici.

**Architecture & restructure** : [`docs/architecture/STRUCTURE-CIBLE.md`](docs/architecture/STRUCTURE-CIBLE.md)

**Où trouver quoi dans ce fichier**

| Besoin | Section |
|--------|---------|
| État VPS Limited / migrate exited | § 0 |
| Guide install complet (DNS, NPM, secrets, stack, Watchtower, mobile…) | **Partie I** |
| Formulaire Git **copier-coller** (prod + preprod) | **Partie II** |
| Migration Limited → Total | **Partie III** |
| Màj un seul service (local ↔ Portainer) | **Partie IV** |

> **Vérité actuelle (2026-08)** — si une section historique dit autrement :  
> Compose path = **`docker-compose.ghcr.yml` (racine)** · `REGISTRY_OWNER=paveldelhomme` · `NPM_NETWORK=shared-network-copy` · Forward NPM en **http**.

---

## A. Ordre de priorité (ne pas inverser)

```text
1. Restructurer le monorepo (base commune web/mobile/backend)
2. Adapter les apps pour déployer par bloc
3. Stacks Portainer Git : cloudity-preprod + cloudity (Total control)
4. Admin « hold / promote » versions + OTA mobile
```

Aujourd’hui on est entre **1** (doc + conventions) et **3** (stack encore Limited sur le VPS).

### A.1 `cloudity-web` vs apps produit (en 20 s)

| | |
|--|--|
| **`cloudity-web`** | Shell (login, hub) **+ encore** Pass/Photos/Office… |
| **`web-mail`** | Mail **extrait** (build séparé) |
| **`web-drive`** | Drive **extrait** (même modèle que Mail) — FE-SPLIT-02 |
| **Image prod** | `cloudity-frontend` assemble shell + `/app/mail` + `/app/drive` + … |

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


---


# Partie I — Installation Portainer PROD (guide complet)


> Contenu repris **intégralement** de l’ancien `deploy/portainer/PORTAINER-INSTALL-PROD.md`.


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

Docs : [DEPLOY.md](../../DEPLOY.md) · [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT_PROCEDURE.md) · [DISTRIBUTION-CHANNELS.md](../../docs/operations/DISTRIBUTION-CHANNELS.md)


---


# Partie II — Formulaire Git Portainer (copier-coller)


> Contenu repris **intégralement** de l’ancien `deploy/portainer/DEPLOIEMENT_PROCEDURE.md (Partie II)`, enrichi preprod.


Stack **`cloudity`** · branche **`prod`**.

---

## Stacks → Add stack

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `docker-compose.ghcr.yml` |
| **Additional paths** | *(laisser vide)* |
| **Repository authentication** | OFF si repo **public** |
| **Environment variables** | coller `deploy/portainer/stack.env` |
| **GitOps updates** | ON (recommandé) |
| **Re-pull image and redeploy** | ON |
| **Prune unused containers** | OFF |

### Pièges déjà vus

| Champ / détail | Bon | Mauvais |
|----------------|-----|---------|
| Compose path | `docker-compose.ghcr.yml` (racine) | `deploy/portainer/...` |
| `db-migrate` | image `cloudity-db-migrate` (GHCR) | bind mount `./scripts` → **vides** sur l’hôte Portainer |
| `REGISTRY_OWNER` | `paveldelhomme` | `PavelDelhomme` |
| `NPM_NETWORK` | `shared-network-copy` (comme Nextcloud) | mauvais nom → web/API injoignables depuis NPM |
| Volume Postgres | **supprimé** avant recreer | volume ancien sans `init/` |

---

## Fichier Environment (PC)

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity
make portainer-prod-env NPM_NETWORK=shared-network-copy
```

Fichier : `deploy/portainer/stack.env` (gitignored).

Dans Portainer → Environment → coller le contenu. Vérifier surtout :

```
REGISTRY_OWNER=paveldelhomme
NPM_NETWORK=shared-network-copy
TAG=latest
```

---

## Avant Deploy (VPS — nettoyage)

```bash
docker rm -f $(docker ps -aq --filter name=cloudity) 2>/dev/null || true
docker volume rm cloudity_postgres_data cloudity_redis_data cloudity_auth_keys cloudity_mobile_data 2>/dev/null || true
docker network rm cloudity-data 2>/dev/null || true
```

---

## Après Deploy — succès si

1. `cloudity-db-migrate` → **Exited (0)** + log `[migrate] Terminé.`
2. `cloudity-api-gateway` → **healthy**
3. `cloudity-web` → **running** sur réseau `shared-network-copy`

Puis NPM :

| Domaine | Forward | Port |
|---------|---------|------|
| `cloudity.delhomme.ovh` (+ apps) | `cloudity-web` | `80` |
| `api.cloudity.delhomme.ovh` | `cloudity-api-gateway` | `8000` |

---

## Mise à jour Portainer (optionnel, après Cloudity OK)

Sur le VPS :

```bash
# récupérer le script depuis le repo cloné ou scp
chmod +x scripts/ops/upgrade-portainer.sh
./scripts/ops/upgrade-portainer.sh          # → 2.39.6 + backup
# Rollback documenté en fin de script
```

 — `cloudity-preprod` (recommandé)

Même formulaire, sauf :

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-preprod` |
| **Repository reference** | `refs/heads/preprod` |
| **Environment** | `stack.env` preprod (`TAG=preprod`, hôtes `*-preprod.…`) |

Fermer l’accès (IP allowlist / Basic auth NPM). Ne **pas** partager le volume Postgres **prod**.

---

## Anti-pièges

| | Bon | Mauvais |
|--|-----|---------|
| Compose path | `docker-compose.ghcr.yml` (racine) | `deploy/portainer/...` |
| Contrôle | Créer **dans** Portainer | `docker compose` SSH → **Limited** |
| `db-migrate` Exited(0) | OK (one-shot) | « service cassé » |
| Migration Limited→Total | `compose down` **sans** `-v` | `volume rm` (perd la DB) |

---

## NPM (après Deploy)

| Domaine | Forward | Port | Scheme |
|---------|---------|------|--------|
| `cloudity.…` | `cloudity-web` | 80 | **http** |
| `api.cloudity.…` | `cloudity-api-gateway` | 8000 | **http** |

---

## Màj

- **Toute la stack** : push branche → GitOps / Pull & redeploy / Watchtower  
- **Un service** : recreate du conteneur concerné (voir `DEPLOIEMENT_PROCEDURE.md` § 5.2)  
- **Mobile** : APK + manifeste OTA (hors Portainer)


---

## Stack preprod — `cloudity-preprod` (recommandé)

Même formulaire, sauf :

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-preprod` |
| **Repository reference** | `refs/heads/preprod` |
| **Environment** | `stack.env` preprod (`TAG=preprod`, hôtes `*-preprod.…`) |

Fermer l’accès (IP allowlist / Basic auth NPM). Ne **pas** partager le volume Postgres **prod**.


---


# Partie III — Migration Limited → Total & opérations


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


---


# Partie IV — Déploiement par composant (local ↔ Portainer)


> Contenu repris de l’ancien `docs/operations/DEPLOIEMENT-PAR-SERVICE.md`.


**Rôle** : mettre à jour **un seul** morceau de Cloudity — en **local** (`make deploy-*`) ou sur le **VPS** (Portainer, un conteneur).

**Lire d’abord** : **[DEPLOIEMENT-ENVIRONNEMENTS.md](DEPLOIEMENT-ENVIRONNEMENTS.md)** (local vs VPS, socle obligatoire, mobile).

Voir aussi : **[RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)** · **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** · **[PORTAINER-VPS.md](PORTAINER-VPS.md)**.

---

## 1. Principe

| Couche | Image / artefact | Mise à jour typique |
|--------|------------------|---------------------|
| **Web** (dashboard SPA) | `cloudity-web` | Rebuild image + `up -d cloudity-web` |
| **API** | `api-gateway` | Rebuild + restart |
| **Backend** | `auth-service`, `mail-directory-service`, `drive-service`, … | Rebuild **un** service + restart |
| **Admin Python** | `admin-service` | Idem |
| **Base** | `db-migrate` | `make migrate` **avant** le service qui lit le nouveau schéma |
| **Mobile** | APK Flutter | Hors Docker — § 4 |

En **Portainer** : changer le tag/digest **d’une seule** image dans la stack, `Pull & redeploy`. Les autres conteneurs restent en place.

---

## 2. Tableau local ↔ Portainer (même composant)

| Composant | Service Compose | **Local** | **Portainer (VPS)** |
|-----------|-----------------|-----------|------------------------|
| **Front web** | `cloudity-web` | `make deploy-web` | Stack `cloudity-web` → redeploy image `cloudity-web` |
| **API** | `api-gateway` | `make deploy-gateway` | Stack `cloudity-identity` → `cloudity-api-gateway` |
| **Auth** | `auth-service` | `make deploy-auth` | Stack `cloudity-identity` → `cloudity-auth-service` |
| **Admin Python** | `admin-service` | `make deploy-admin` | Stack `cloudity-identity` → `cloudity-admin-service` |
| **Mail** | `mail-directory-service` | `make deploy-mail` | Stack `cloudity-mail` |
| **MTA alias** | `deploy/mail-mta` / `cloudity-maddy` | `docker compose -f deploy/mail-mta/docker-compose.local.yml up -d` | Stack séparée `cloudity-mail-mta` |
| **Pass** | `passwords-service` | `make deploy-pass` | Stack `cloudity-pass` |
| **Drive** | `drive-service` | `make deploy-drive` | Stack `cloudity-drive` |
| **Photos** | `photos-service` | `make deploy-photos` | Stack `cloudity-photos` |
| **Contacts** | `contacts-service` | `make deploy-service SERVICE=contacts-service` | Stack `cloudity-comm` |
| **Tasks** | `tasks-service` | `make deploy-service SERVICE=tasks-service` | Stack `cloudity-comm` |
| **Notes / Calendar** | `notes-service` / `calendar-service` | `make deploy-service SERVICE=…` | Stack `cloudity-comm` |
| **Tout** | tous | `make up` / `make rebuild` | Déployer les 8 stacks (ordre § DEPLOIEMENT-VPS § 3) |

> Erreur fréquente : pour Mail, utiliser **`deploy-mail`**, pas `deploy-web`.

## 2bis. Suite productivité (Contacts / Tasks / Notes) — local

Ordre fixe quand le schéma change : **migrate → service API → front**.

| Chantier | Migration | Commandes locales |
|----------|-----------|-------------------|
| **APP-08 Contacts** (fiche `profile` JSONB) | **49** `49-contacts-profile.sql` | `make migrate` → `make deploy-service SERVICE=contacts-service` → `make deploy-web` |
| **APP-07 Tasks** (sous-tâches, notes, `start_at`, étoile) | **50** `50-tasks-rich.sql` | `make migrate` → `make deploy-service SERVICE=tasks-service` → `make deploy-web` |
| **APP-06 Notes** | **51–52** `51-notes-keep.sql` + `52-notes-keep-extras.sql` (+ color **19**) | `make migrate` → `make deploy-service SERVICE=notes-service` → `make deploy-web` |

Smoke :

```bash
curl -sf http://localhost:6011/health   # contacts
curl -sf http://localhost:6009/health   # tasks
# UI : http://localhost:6001/app/contacts · /app/tasks · /app/notes
```

VPS : job **db-migrate** (stack infra) **avant** redeploy des images `contacts-service` / `tasks-service` / `cloudity-web` dans Portainer. Détail produit : [`docs/produit/SUITE-PRODUCTIVITY-GAP.md`](../produit/SUITE-PRODUCTIVITY-GAP.md).

## 3. Développement local (`make`)

| Besoin | Commande |
|--------|----------|
| Première fois / tout démarrer | `make up` (pas de Portainer, pas de NPM) |
| Tout reconstruire | `make rebuild` |
| **Front uniquement** | `make deploy-web` |
| **Gateway** | `make deploy-gateway` |
| **Auth** | `make deploy-auth` |
| **Mail** | `make deploy-mail` |
| **Pass** | `make deploy-pass` |
| **Drive / Photos** | `make deploy-drive`, `make deploy-photos` |
| **Un service Go** (contacts, tasks, notes, …) | `make deploy-service SERVICE=contacts-service` |
| Migrations SQL | `make migrate` |
| Extension Pass MV3 | `make build-pass-extension` (pas un conteneur) |

Équivalent manuel :

```bash
docker compose build cloudity-web
docker compose up -d cloudity-web
```

---

## 4. Production (VPS + Portainer + NPM)

### 3.1 Flux Git → image

1. Push sur la branche qui déclenche **GitHub Actions** (`docker-publish.yml` si configuré) → image `ghcr.io/.../cloudity-<service>:<tag>`.  
2. Dans Portainer : stack **frontend** ou **backend** → variable `TAG=v2026.05.18` **uniquement** pour le service modifié.  
3. **Pull & redeploy** du conteneur concerné.  
4. Si migration : job **db-migrate** ou `docker compose run --rm db-migrate` **avant** le service.

### 3.2 Matrice « je change quoi »

| Tu modifies… | Redéployer | Migrer ? |
|--------------|------------|----------|
| React / Vite (`frontend/apps/cloudity-web`) | `cloudity-web` | Non |
| `api-gateway` | `api-gateway` | Rarement |
| `auth-service` | `auth-service` | Parfois |
| `mail-directory-service` | `mail-directory-service` | Souvent — `migrate` d’abord |
| `deploy/mail-mta` / DNS alias | stack `cloudity-mail-mta` séparée | Non, sauf ajout colonnes admin domaines |
| `passwords-service` | `passwords-service` | Parfois |
| `drive-service`, `photos-service`, … | service ciblé | Selon migration |
| `contacts-service` (APP-08) | `contacts-service` | **Oui** — mig. **49** d’abord |
| `tasks-service` (APP-07) | `tasks-service` | **Oui** — mig. **50** d’abord |
| `notes-service` (APP-06) | `notes-service` | Selon migration |
| `.env` secrets seulement | **Restart** services qui lisent la variable | Non |
| App Flutter `mobile/mail` | **APK** + `version.json` | Non |

### 3.3 NPM (HTTPS)

Le navigateur ne parle qu’à **Nginx Proxy Manager**. Les microservices restent sur le réseau Docker interne — pas besoin de redéployer NPM pour un fix front.

---

## 4. Mobile (hors compose)

| App | Build | Distribution |
|-----|-------|----------------|
| Mail | `cd mobile/mail && flutter build apk --release` | APK signé + **[RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)** § 4 |
| Drive / Photos / Pass | idem chemins `mobile/*` | Même canal `version.json` (backlog **REL-01**) |

Le mobile consomme la **même API** (gateway) : une mise à jour **backend** peut exiger une mise à jour **app** si le contrat API change.

---

## 6. Push Git

```bash
git push origin feat/ma-branche
# Puis CI build → Portainer pull du tag concerné
```

Pas de push automatique vers le VPS : tu choisis **quel** service redéployer dans Portainer.

---

*Dernière mise à jour : 2026-08-04 (suite productivité APP-08 / APP-07).*
