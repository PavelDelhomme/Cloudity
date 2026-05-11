# Cloudity — découpage multi-repos GitHub (plan d’architecture)

**Rôle** : décrire **comment** transformer Cloudity (monorepo unique aujourd’hui) en **suite de dépôts GitHub indépendants** réunis sous un **dépôt parent** (« meta-repo »), tout en gardant :

1. la **réutilisabilité** de design (composants UI, helpers HTTP, types API) ;
2. les **intégrations cross-app** (Mail → Contacts, Pass → Alias mail, etc.) ;
3. les **tests** par projet **et** un E2E global ;
4. le déploiement **prod** via **Portainer** + **nginx-proxy-manager** (NPM) sans casser les domaines.

> Ce document est un **plan**. Aucune scission de repo n’a encore eu lieu : il faut d’abord trancher les options en bas du fichier.

Voir aussi : **[BACKEND-LAYOUT.md](./BACKEND-LAYOUT.md)**, **[FRONTEND-LAYOUT.md](./FRONTEND-LAYOUT.md)**, **[REVERSE-PROXY.md](./REVERSE-PROXY.md)**, **[MTLS-INTERNE.md](./MTLS-INTERNE.md)**, **[ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)**.

---

## 1. Carte des dépôts cibles

### 1.1 Dépôt parent (« meta-repo »)

- **`cloudity/cloudity`** (ou `cloudity-platform`) — le **point d’entrée**. Contient :
  - **`docker-compose.yml`** (orchestration locale dev) ;
  - **`Makefile`** (cibles transverses : `up`, `test`, `migrate`, `tests`) ;
  - **`infrastructure/`** (Postgres init, migrations, step-ca, reverse-proxy, NPM/Portainer prod) ;
  - **`docs/`** (documents transverses dont **ce fichier**) ;
  - références aux autres dépôts (sous-modules **ou** subtrees **ou** `repo` Google **ou** workspace `vendir`/`mu-repo` — voir § 4).

### 1.2 Dépôts services backend

| Dépôt | Stack | Rôle |
|-------|-------|------|
| **`cloudity-api-gateway`** | Go (Gorilla Mux) | Passerelle HTTP unique (auth, rate-limit, headers, proxy). |
| **`cloudity-auth-service`** | Go (Gin) | Auth JWT, refresh, 2FA, comptes. |
| **`cloudity-passwords-service`** | Go (Gin) | Coffre Pass (`/pass/*`) — ciphertext opaque. |
| **`cloudity-mail-directory-service`** | Go (Gin) | Boîtes / domaines / **alias** / IMAP/SMTP. |
| **`cloudity-drive-service`** | Go (Gin) | Drive, corbeille, recherche. |
| **`cloudity-photos-service`** | Go (Gin) | Timeline photos (Drive en backing store). |
| **`cloudity-calendar-service`** | Go (Gin) | Événements, calendriers utilisateur. |
| **`cloudity-contacts-service`** | Go (Gin) | Carnet d’adresses (cible : source de vérité Mail/Cal/Drive). |
| **`cloudity-notes-service`** | Go (Gin) | Notes courtes. |
| **`cloudity-tasks-service`** | Go (Gin) | Tâches, règles de répétition. |
| **`cloudity-admin-service`** | Python (FastAPI) | Back-office tenants/users/CVE. |

### 1.3 Bibliothèques partagées (transverses)

| Dépôt | Stack | Rôle |
|-------|-------|------|
| **`cloudity-internalsec`** | Go (lib) | mTLS client/server, helpers env/cert ; aujourd’hui via `replace` local. |
| **`cloudity-pkg-dbpin`** | Go (lib) — **nouveau** | Connexion PG **épinglée** (cf. `dbpin.go` dupliqué dans 7 services). |
| **`cloudity-shared-web`** (`@cloudity/shared`) | TS / React | Composants UI, helpers, types API partagés frontend. |
| **`cloudity-shared-mobile`** (Dart) | Dart | `cloudity_shared` (helpers HTTP, sémantique JWT) — déjà en place. |
| **`cloudity-api-contracts`** — **nouveau** | OpenAPI / JSON Schema | **Contrat** des API publiques exposées par la gateway (utilisé par les clients web/mobile/extensions). |

### 1.4 Frontends (UI)

| Dépôt | Stack | Rôle |
|-------|-------|------|
| **`cloudity-web`** | React + Vite | SPA utilisateur + bundle admin (mêmes routes : `/app/...` et `/4dm1n`). |
| **`cloudity-mobile-mail`** | Flutter | App mobile Mail. |
| **`cloudity-mobile-drive`** | Flutter | App mobile Drive. |
| **`cloudity-mobile-photos`** | Flutter | App mobile Photos. |
| **`cloudity-mobile-pass`** — **nouveau** | Flutter | App mobile Pass (à créer). |
| **`cloudity-mobile-admin`** | Flutter | App mobile back-office (`mobile/admin_app`). |
| **`cloudity-extension-pass`** — **nouveau** | TS / WebExtension MV3 | Extension navigateur Pass (autofill + alias). |
| **`cloudity-desktop-linux`** — **nouveau** | Tauri / Electron *(à figer)* | Application Linux (Mail, Drive, Pass, Photos…) en wrapper. |

### 1.5 Outillage / infra

| Dépôt | Stack | Rôle |
|-------|-------|------|
| **`cloudity-infra`** *(option)* | Compose / Helm / Portainer stacks / NPM templates | Sépare l’infra **prod** du dépôt parent dev. Sinon reste dans le meta-repo. |
| **`cloudity-step-ca-config`** *(option)* | Step-CA | Profils de certs, scripts `step-renew`. |

### 1.6 Récapitulatif

- **~11 services backend** (Go + 1 Python) ;
- **~5 bibliothèques** partagées ;
- **~7 frontends** (web, mobile×4–5, extension, desktop) ;
- **1 meta-repo** + éventuellement **1 dépôt infra**.

⇒ **17 à 25 dépôts** GitHub selon les options retenues.

---

## 2. Pourquoi pas une simple scission « 1 service = 1 repo » ?

Risques **identifiés dans le code actuel** :

1. **`internalsec` Go** est importé par plusieurs services Go via `replace github.com/pavel/cloudity/internalsec => ../internalsec` + COPY dans le `Dockerfile.dev` (cf. **MTLS-INTERNE.md** § 4). En polyrepo strict, il faut soit :
   - publier `internalsec` comme module Go versionné (chemin canonique `github.com/cloudity/internalsec` + tags `v0.x.y`) ;
   - garder un **vendoring** par service (copie locale CI) ;
   - utiliser un **submodule Git** synchronisé.
2. **`dbpin.go`** est **dupliqué** dans 7 services — exactement le genre de code à extraire dans `cloudity-pkg-dbpin` avant la scission.
3. **`@cloudity/shared`** est aujourd’hui linké en `file:../../packages/cloudity-shared` (workspace npm). En polyrepo : passer en package **publié** (registry **npm public** ou **GitHub Packages**) + version semver, ou utiliser **`pnpm` workspace** sur sous-modules.
4. **`cloudity_shared`** (Dart) est en `path: ../cloudity_shared` — même problème, à publier sur **pub.dev** ou via **git ref** dans `pubspec.yaml`.
5. **Schéma SQL Postgres** (`infrastructure/postgresql/migrations/*.sql`) est **commun** à tous les services Go : où vit-il ? Solutions :
   - **Garder** dans le meta-repo (recommandé) — chaque service Go ne fait que des requêtes SQL ;
   - **OU** publier un dépôt `cloudity-db-migrations` consommé par le job `db-migrate` Compose.
6. **Tests E2E Playwright** (`frontend/apps/cloudity-web/e2e/`) couvrent **plusieurs apps** : ils restent dans le meta-repo ou dans `cloudity-web` (à choisir).
7. **`docker-compose.yml`** référence **15 services** : il vit dans le meta-repo, **chaque service** fournit son **`Dockerfile.dev`** + un `docker-compose.fragment.yml` que le meta inclut via `extends:` ou un `compose merge`.
8. **Documentation transverse** (SECURITE, ROADMAP, STATUS, BACKLOG, …) : reste dans le **meta-repo** ; chaque sous-dépôt n’a que son propre `README.md` et son `CHANGELOG.md`.

---

## 3. Trois options techniques

### Option A — **Polyrepo + meta-repo avec `git submodule`** *(simple, classique)*

- **Meta-repo** = liste de submodules pointant chacun vers un commit précis du sous-dépôt.
- **Avantages** : un seul `git clone --recurse-submodules` ; chaque sous-dépôt versionné de manière indépendante ; CI propre par sous-dépôt.
- **Inconvénients** : ergonomie sous-modules (oublier `git submodule update`, état détaché…), parfois pénible avec Cursor/IDE multi-fenêtres.

### Option B — **Polyrepo + meta-repo avec `git subtree`**

- Le meta-repo **importe** une copie figée de chaque sous-dépôt ; on synchronise via `git subtree pull/push`.
- **Avantages** : pas de config submodule ; un seul checkout.
- **Inconvénients** : flux d’aller-retour `subtree push` plus délicat ; risques de divergence entre sous-dépôts et meta-repo.

### Option C — **Polyrepo + outil meta (`Meta`, `mu-repo`, `repo` Google, `mr`)**

- **Meta-repo** = un fichier `.meta` ou `manifest.xml` listant les URLs Git ; `meta git status` itère sur tous.
- **Avantages** : aucune obligation de submodules ; CI peut cloner sélectivement.
- **Inconvénients** : outil supplémentaire à installer ; pas de `commit atomique` cross-repo (mais peu pertinent en polyrepo de toute façon).

### Option D — **Garder le monorepo + `CODEOWNERS` par dossier + workflows scoped**

- Pas de scission ; on **utilise GitHub** d’une autre manière : CI déclenchée seulement quand le path concerné change, branches `feat/mail/*`, releases tagués `mail-1.x` / `drive-2.y`, `CODEOWNERS` pour figer les responsabilités.
- **Avantages** : zéro friction de migration ; commits atomiques cross-app possibles ; tests E2E directs.
- **Inconvénients** : pas de « projets GitHub indépendants » ; un fork forcé du dépôt entier pour modifier une seule app.

> Recommandation **pragmatique** : **commencer par D** *en attendant que les chantiers Mail/Photos/Pass se stabilisent*, puis **migrer vers A** (polyrepo + submodules) ou **C** (manifest), en commençant par les **bibliothèques** (`internalsec`, `cloudity-shared`) car **publier** ces packages est de toute façon nécessaire pour casser les `replace` / `file:`.

---

## 4. Plan de migration progressive (si option A / C retenue)

### Phase 0 — préparer le **monorepo** *(à faire avant toute scission)*

1. Extraire **`backend/pkg/dbpin`** (lib Go interne) :
   - module `github.com/pavel/cloudity/pkg/dbpin` ;
   - chaque service `replace … => ../pkg/dbpin` + COPY Docker.
2. Geler le **chemin de module** `internalsec` (passer de `github.com/pavel/cloudity/internalsec` à `github.com/cloudity/internalsec` si on prévoit un repo public).
3. **Versionner** `@cloudity/shared` (publier `0.1.0` sur GitHub Packages) — `frontend/apps/cloudity-web/package.json` passe à `"@cloudity/shared": "^0.1.0"`.
4. **Versionner** `cloudity_shared` Dart (tag git **ou** `pub.dev`).
5. Définir un **schéma OpenAPI** par service (à terme **`cloudity-api-contracts`**) consommé par le frontend / les apps mobile / l’extension.

### Phase 1 — extraire les **bibliothèques** dans leur repo

- `cloudity-internalsec`, `cloudity-pkg-dbpin`, `cloudity-shared-web`, `cloudity-shared-mobile`, `cloudity-api-contracts`.
- Chaque dépôt publie via **GitHub Releases** (Go : tags `v…`, npm : packages, Dart : tags + ref git).
- Le monorepo Cloudity passe à des dépendances **publiées**.

### Phase 2 — extraire **un service** comme pilote

- Choix conseillé : **`auth-service`** (peu d’imports inter-services) **ou** **`tasks-service`** (le plus simple).
- Refactor : `Dockerfile` autonome, CI GitHub Actions par dépôt (lint, test, build, image GHCR), Compose dans le meta-repo récupère l’image **`ghcr.io/cloudity/auth-service:tag`** au lieu de `build:`.

### Phase 3 — extraire **chaque** autre service un par un

- Idem service par service ; à chaque fois le `docker-compose.yml` du meta-repo bascule de `build:` vers `image:`.

### Phase 4 — extraire les **frontends**

- `cloudity-web` est plus simple en premier (un seul `package.json` aujourd’hui).
- Mobiles : un repo par app (`cloudity-mobile-mail`, `…-drive`, `…-photos`, **`…-pass`** à créer), tous consommant `cloudity-shared-mobile`.
- Extension navigateur Pass : repo dédié.

### Phase 5 — extraire **infra** *(option)*

- Reverse-proxy / Portainer / NPM templates / step-ca / migrations (si décidé).

---

## 5. Réutilisabilité du **design** (ce que tu demandes)

Pour qu’un fix UI sur **Mail** ne casse pas **Calendar** mais que les composants restent **partagés** :

- Tous les composants UI **génériques** (`Button`, `PageLayout`, `Card`, `PaginationControls`, `GlobalSearchPalette` *non Mail-spécifique*, etc.) vivent dans **`@cloudity/shared`** (`packages/cloudity-shared/` aujourd’hui).
- Les composants **spécifiques** à un domaine (ex. `MailPageChrome`) restent dans **`pages/app/mail/`** ou **`features/mail/`**.
- Cible (**ARCHITECTURE-FRONTENDS.md**) : passer le shell `cloudity-web` à un layout par feature : `src/features/<domaine>/` au lieu de `src/pages/app/<domaine>/`.
- En **polyrepo** : `@cloudity/shared` doit être **versionné** (semver) ; un changement breaking → bump majeur ; les apps mettent à jour à leur rythme.

---

## 6. Intégrations cross-app sans couplage

Tu veux pouvoir, depuis **Mail**, **ajouter un contact**. C’est OK même en multi-repo, à condition de **passer par l’API gateway** plutôt que par des imports croisés :

| Action | Aujourd’hui | Multi-repo cible |
|--------|-------------|-------------------|
| « Ajouter ce contact depuis un mail » | `MailPage.tsx` appelle directement `createContact()` (`api.ts`) | Idem, mais `createContact` est typé via **`cloudity-api-contracts`** (TS généré depuis OpenAPI). |
| « Créer un alias mail depuis Pass (formulaire d’inscription dans le navigateur) » | À implémenter | Extension Pass appelle `POST /mail/me/aliases` (mail-directory-service) + `POST /pass/items` (passwords-service) via le gateway, le tout typé. |
| « Lier un évènement à un contact » | À implémenter | Calendar appelle `GET /contacts/:id` ; pas d’import de code Contacts dans Calendar. |
| « Pièce jointe Drive depuis Mail » | Lien Drive dans le compose mail | Mail appelle `GET /drive/nodes/:id` puis insère un lien signé. |

**Règle d’or** : **aucune** dépendance de code direct entre apps métier. Tout passe par les **API publiques** + types **`cloudity-api-contracts`**. Cela permet de modifier Mail sans casser Calendar.

---

## 7. Tests dans une organisation multi-repo

| Niveau | Où vit le test | Outil | Quand il tourne |
|--------|----------------|-------|-----------------|
| **Unitaire** | Dans le **dépôt** du service / app | Go test, Vitest, Flutter test, Pytest | À chaque PR du dépôt. |
| **Contract / API** | **`cloudity-api-contracts`** + dépôt service | Schemathesis / Dredd / openapi-diff | Jobs PR du service + nightly du contrat. |
| **E2E navigateur** | **Meta-repo** (ou `cloudity-web`) | Playwright | Stack complète via `make up` dans la CI du meta-repo. |
| **E2E mobile** | Dépôt app mobile + appareil/AVD | `flutter integration_test` | Jobs spécifiques + opt-in. |
| **Sécurité** | Meta-repo | `make test-security` (govulncheck, npm audit, safety) | Avant release. |

⇒ Sur le **meta-repo** : le `make test` global devient un **fan-out** : pour chaque dépôt source, déclencher la CI distante (ou cloner + test localement). Variantes :

- `meta exec 'go test ./...'` (option C) ;
- ou un workflow GitHub `meta-repo` qui orchestre via `workflow_dispatch` sur les CIs des sous-dépôts.

---

## 8. Production : Portainer + nginx-proxy-manager

Cible déjà mentionnée ; à formaliser :

```
Internet ──HTTPS──► nginx-proxy-manager (NPM)
                       │  (route par hostname → conteneurs internes)
                       ├── api.cloudity.tld          → cloudity-api-gateway
                       ├── app.cloudity.tld          → cloudity-web (`/app/*`)
                       ├── admin.cloudity.tld        → cloudity-web (`/4dm1n`)
                       ├── mail.cloudity.tld (option) → cloudity-web (`/app/mail`) ou alias `app.`
                       └── ...
                       
Portainer ── orchestre les stacks Docker (1 stack par service ou 1 stack global)
```

### 8.1 Stratégies de stack Portainer

- **Mono-stack** : `docker-compose.yml` complet importé dans Portainer en **stack unique** (simple, redéploie tout).
- **Multi-stacks par domaine** : `stack-auth.yml`, `stack-mail.yml`, `stack-pass.yml`, `stack-shared-infra.yml` (Postgres, Redis, NPM). Chaque stack peut être recréée indépendamment ⇒ **résilience** : redémarrer Mail ne touche pas Pass.

### 8.2 NPM — règles à figer

| Hostname | Cible interne | Notes |
|----------|---------------|-------|
| `api.<tld>` | `api-gateway:8000` | Force HTTPS, HSTS, redirect HTTP → HTTPS, cache off. |
| `app.<tld>` | `cloudity-web:3000` | SPA ; **`/auth`, `/api`, `/pass`** doivent passer par `api.` (CORS clair). |
| `admin.<tld>` | `cloudity-web:3000` (route `/4dm1n`) | Idéal : ACL IP + 2FA obligatoire (audit `AUDIT-SECURITE-ADMIN-API.md`). |
| `mail.<tld>`, `drive.<tld>` (option) | `cloudity-web:3000` | Alias UX, pas de route distincte. |

NPM gère **Let’s Encrypt** automatiquement (DNS-01 si IP privée). Le **hardening** TLS 1.3 / HSTS / CSP **doit** rester aligné avec **REVERSE-PROXY.md** § 2.

### 8.3 Backups & résilience

Cible UI : un panneau **`/4dm1n/backups`** (côté `admin-service`) :

- **Volumes** Docker (Postgres, Redis, blobs Drive, mail attachments) ;
- **Snapshots** PostgreSQL (`pg_basebackup` / **WAL-G** / **Restic**) ;
- **Restic** chiffré (Argon2id passphrase, déjà PQ-safe) sur un bucket / disque déporté ;
- **Bouton** « Lancer maintenant », « Restaurer un point », **plan** quotidien (cron interne) ;
- Métriques de **dernière sauvegarde réussie**, taille, durée — exposées dans Dashboard admin.

Même chose pour la **résilience** (réplication PG, multi-instances services Go) : un service tourne en `replicas: N`, NPM round-robin, healthchecks Compose. À documenter quand prod cible.

---

## 9. Impact sur le code aujourd’hui

| Élément | Action préliminaire (Phase 0) |
|---------|--------------------------------|
| `backend/internalsec` (lib) | Tagger un **`v0.1.0`** ; documenter le chemin de module final. |
| `backend/*/dbpin.go` (7 copies) | Extraire dans **`backend/pkg/dbpin`** (un module Go) + ajustements `Dockerfile.dev` (COPY `pkg/dbpin/`). |
| `frontend/packages/cloudity-shared` | Tagger `v0.1.0` ; configurer GitHub Packages (`@cloudity` scope). |
| `mobile/cloudity_shared` | Tagger `v0.1.0` ; basculer `pubspec.yaml` des apps de `path:` vers `git: ref: v0.1.0` à terme. |
| `infrastructure/postgresql/migrations/` | Reste **dans le meta-repo** ; documenter dans **EVOLUTION-PLATEFORME.md** que les services **ne** modifient pas le schéma. |
| `docker-compose.yml` | À terme : `image: ghcr.io/cloudity/<service>:<tag>` au lieu de `build: ./backend/<service>` une fois les sous-dépôts en place. |

---

## 10. Questions à trancher (avant exécution)

> **Questionnaire à choix multiple** (une option par question + court texte libre en fin) : **[MULTI-REPO-QUESTIONNAIRE.md](./MULTI-REPO-QUESTIONNAIRE.md)**.  
> Renseigne les Q1–Q10 (ou la ligne « Synthèse rapide » du questionnaire), puis on enchaîne avec la **Phase 0** § 4.

Résumé des thèmes couverts : stratégie de scission (A/B/C/D), granularité backend / mobile, registry packages, emplacement `infrastructure/`, CI, Portainer/NPM, backups, extension Pass + desktop Linux (quand + Tauri/Electron), calendrier Phase 0.

---

## 11. Bénéfices attendus

- **Travail isolé** : modifier Mail (web ou backend) ne touche que son dépôt → PR ciblée.
- **Releases indépendantes** : `cloudity-mail-directory-service v1.4.0` peut sortir sans toucher Pass.
- **Sécurité** : permissions GitHub par dépôt (admin Pass plus restrictif).
- **Extension / mobile** : peuvent vivre dans des dépôts publics (open source UI) sans révéler le code serveur si tu le souhaites un jour.
- **Production** : NPM + Portainer pointent vers des **images** versionnées (GHCR) ; pas de rebuild local en prod.

## 12. Coûts à anticiper

- **CI 10×** : il faut câbler 10+ workflows (modèle réutilisable depuis un dépôt `cloudity-actions-shared`).
- **Onboarding** : un script `bootstrap-dev.sh` pour cloner tous les dépôts d’un coup.
- **Synchronisation `internalsec` / `cloudity-shared`** : casser une release casse tous les consommateurs ; documenter le **flow de bump** (release → PR auto sur les apps via Renovate / Dependabot).
- **Tests E2E** : besoin d’un environnement « stack complète » (le meta-repo joue ce rôle).

---

*Document à mettre à jour quand le **[MULTI-REPO-QUESTIONNAIRE.md](./MULTI-REPO-QUESTIONNAIRE.md)** est rempli ou quand une phase change.*
