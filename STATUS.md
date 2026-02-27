# CLOUDITY — Suivi d’avancement et référence projet

**Dernière mise à jour** : 2026-02-27  
**Branche de référence** : `main` (travail basé sur `origin/main`)  
**Document de référence** : ce fichier sert de **référence unique** pour l’avancement et les prochaines étapes.

---

## 0. Démarrage

| Action | Commande |
|--------|----------|
| **Démarrer la stack** | `make up` |
| **Arrêter la stack** | `make down` |
| **Logs en temps réel** | `make logs` |
| **Aide Make** | `make help` |
| **Première fois** | **`make setup`** puis **`make up-full`** |

**URLs** : App principale http://localhost:6001 | Admin http://localhost:6001/admin | API http://localhost:6080 | Adminer http://localhost:6083 | Redis Commander http://localhost:6084

**Connexion locale** : Il n’y a pas de compte par défaut. Soit créer un compte sur http://localhost:6001/register , soit lancer **`make up-full`** (après **`make setup`**) pour créer le compte de démo **admin@cloudity.local** / **Admin123!** (tenant 1). **`make up-full`** = down + up + attente services + seed + seed-admin + **make test** (une seule commande, vérification incluse).

### Tests (à suivre absolument)

| Commande | Rôle |
|----------|------|
| **`make test`** | Lance **uniquement** les tests unitaires + applicatifs (Go, pytest, Vitest). **Ne lance pas les E2E.** À exécuter avant chaque merge/feature. |
| **`make test-e2e`** | **Tests E2E à part** : vérifie que les services répondent (health, gateway proxy). **Prérequis : `make up`** avant, puis **attendre 20-30 s** que tous les services soient healthy. |
| **`make test-all`** | Lance **`make test`** puis **`make test-e2e`** (tout en une commande ; E2E échouera si la stack n’est pas up). |
| **`make test-security`** | Audits de dépendances (npm, pip safety, govulncheck) + checks auth (401 sans token / token invalide sur `/auth/validate`). |
| **`make test-docker`** | Même batterie que make test mais **dans** les conteneurs (make up avant). |
| **`make test-full`** | test-all + test-docker (tout, stack up requise). |

**Important** : Pour **tout** vérifier (unit/app + E2E + sécurité) : **`make up`**, attendre 20-30 s, puis **`make test-all`**. Pour inclure aussi les tests dans les conteneurs : **`make test-full`**.  
**Pourquoi attendre ?** Le **gateway** ne démarre qu’une fois **auth-service**, **admin-service** et **password-manager** déclarés **healthy** par Docker (depends_on + healthcheck). Après un `make up`, Postgres/Redis puis les backends passent healthy en ~20-30 s, ensuite le gateway et le dashboard.

**Ce que `make test` exécute :**
- **auth-service** (Go) : `go test ./...` → health, hash, JWT, register, login, validate, refresh, 2FA enable/verify (dont code invalide), **écriture public.pem si clé générée** → **15 tests**.
- **api-gateway** (Go) : `go test ./...` → health, routage `/auth/*`, `/admin/*`, `/pass/*`, **`/mail/*`**, **CORS** → **7 tests**.
- **password-manager** (Go) : `go test ./...` → health, auth requis pour `/pass/vaults` → **3 tests**.
- **mail-directory-service** (Go) : `go test ./...` → health, `/mail/health`, `/mail/domains` sans X-Tenant-ID → 401, X-Tenant-ID invalide → 401 → **4 tests**.
- **drive-service** (Go) : `go test ./...` → health, GET /drive/nodes sans X-User-ID → 401 → **2 tests**.
- **admin-service** (Python) : `pytest tests/` → **21 tests**.
- **admin-dashboard** (Vitest) : **14 fichiers**, **61 tests**.

**Total : 114+ tests** (make test).

**Détail des tests et liste des tests à faire** : voir **[TESTS.md](./TESTS.md)**.

**Règle** : pour chaque fonctionnalité implémentée, ajouter des tests exécutables via `make test`. Ne pas merger une feature sans tests associés.

**Reprise (à faire)** : Tests Drive — les tests unitaires (Vitest) et la boucle 20 runs passent. E2E Playwright (`e2e/drive.spec.ts`) est en place contre l’app sur le port 6001. À vérifier en conditions réelles dans le navigateur : que les boutons **Téléverser**, **Dossier** et **Nouveau dossier** ouvrent bien le sélecteur de fichier / le formulaire (si blocage, vérifier les labels `htmlFor` et les inputs dans `AppLayout` ; lancer `BASE_URL=http://localhost:6001 npx playwright test e2e/drive.spec.ts` pour reproduire). Clarifier un éventuel doublon d’affichage « Nouveau dossier » (toolbar Drive vs autre zone).

**État (2026-02-27)** : **Migrations DB automatiques** au `make up` (service db-migrate). **Calendar, Notes, Tasks** : schémas 05/06/07, services avec DB et CRUD, pages web connectées. **Drive** : opérationnel. **OnlyOffice** : à faire (édition de documents type Nextcloud). **JWT** : clés RSA persistées (private.pem + public.pem) pour éviter l’invalidation des tokens au redémarrage. **API** : le dashboard en Docker utilise `VITE_API_URL=http://localhost:6080` (port 6080 car Chrome bloque 6000 — ERR_UNSAFE_PORT). En cas de 401, vérifier que vous êtes bien connecté ou faire **make setup** puis **make up**.

---

## 1. Ce que je dois faire (priorités)

Section pour **avancer concrètement** : cocher au fur et à mesure.

### Immédiat (base actuelle)

- [x] **Vérifier la stack** : `make up` puis ouvrir http://localhost:6001 et http://localhost:6080/health ; Redis healthy, tous les services démarrent. (Correction Redis : mot de passe passé via shell pour que la variable d’env soit bien utilisée.)
- [x] **Consolider l’auth** : Argon2id pour les mots de passe, refresh tokens avec rotation, 2FA TOTP opérationnel (auth-service). Tests associés (main_test.go).
- [x] **Renforcer admin** : admin-service (CRUD users, rôles, CRUD tenants) ; admin-dashboard (écrans Tenants, Users, Settings reliés à l’API, logout branché). Tests : pytest (health, tenants, users), vitest (App, Tenants, Users, Settings).

### Phase 1 — Password Manager MVP

- [x] **Backend password-manager** (Go) : API REST (auth via gateway), CRUD vault/items, stockage blobs chiffrés côté client (serveur ne voit que ciphertext). Port 6051, route `/pass/*`.
- [x] **Schéma DB** : tables/schema `pass` (pass_vaults, pass_items) dans `infrastructure/postgresql/init/02-schema-pass.sql`.
- [ ] **App Flutter** (web + desktop Linux) : liste/CRUD mots de passe, déchiffrement côté client.
- [ ] **Extension navigateur** (Brave/Chrome, Manifest v3) : lecture/ajout, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis dans le Compose.
- [x] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API). Port 6050, route gateway `/mail/*`.
- [x] **Schéma DB mail** : `03-schema-mail.sql` (mail_domains, mail_mailboxes, mail_aliases).
- [ ] **mail-client-api** : wrapper IMAP/SMTP en REST pour l’UI.
- [ ] **Client mail Flutter** (web + Linux) : lecture/envoi, dossiers, étiquettes.
- [ ] **Client mail web (admin-dashboard)** : envoi, brouillons, dossiers, déplacer des mails, récupération, gestion de plusieurs boîtes (à brancher sur mail-client-api).
- [x] **Page Domaines** (admin-dashboard) : liste + création domaines mail, API /mail/domains.

### Phase 3 — Alias + intégration

- [ ] **API alias** dans mail-directory (création alias temp/permanent, expiration).
- [ ] **Extension Pass** : bouton « Créer alias » → appel API → stockage dans le vault.
- [ ] **UI Cloudity** : vue centralisée des alias.

### Phase 4 et après

- [ ] **Mail E2E** (OpenPGP) pour mails Cloudity–Cloudity.
- [x] **Drive (MVP)** : schéma DB `04-schema-drive.sql` (drive_nodes), **drive-service** (Go) avec CRUD dossiers/fichiers en cascade (list/create/rename/delete/upload/download), auth X-User-ID. Route gateway `/drive/*`. **Client web** : page Drive avec breadcrumb, création de dossiers en cascade, téléversement, renommer, supprimer, télécharger (type Google Drive / Nextcloud).
- [x] **Calendar, Notes, Tasks (MVP)** : schémas DB `05-schema-calendar.sql`, `06-schema-notes.sql`, `07-schema-tasks.sql`. **calendar-service**, **notes-service**, **tasks-service** (Go) avec DB, auth X-User-ID, CRUD complet. Routes gateway `/calendar/*`, `/notes/*`, `/tasks/*`. **Client web** : pages Agenda, Notes, Tâches connectées aux API (liste, création, mise à jour).
- [ ] **OnlyOffice** : intégration type Nextcloud pour édition de documents (DOCX, XLSX, etc.) depuis le Drive. À planifier (Document Server + connecteur frontend).
- [ ] **Drive avancé** : chiffrement côté client (E2E), stockage objet pour gros fichiers.
- [ ] **Apps mobiles** Mail + Pass (Flutter).
- [ ] **Contacts** : app Contacts web + mobile (interconnectée Mail, Calendar, Tasks).
- [ ] **Photos** : app Photos web + mobile (galerie, stockage).
- [ ] **Prod** : Nginx Proxy Manager, TLS 1.3, backups chiffrés.

**Migrations DB** : au démarrage (**`make up`**), le service **db-migrate** applique automatiquement les scripts dans `infrastructure/postgresql/migrations/` (04-schema-drive, 05-calendar, 06-notes, 07-tasks, 20250225_mail). Aucune action manuelle : base existante ou nouvelle reçoit les migrations. En manuel : **`make migrate`**. **JWT** : l’auth-service persiste désormais **private.pem** et **public.pem** lorsqu’il génère les clés ; après un redémarrage, les mêmes clés sont rechargées et les tokens restent valides (plus besoin de se déconnecter/reconnecter). **Register** : si l’email existe déjà pour le tenant, l’API renvoie **409 Conflict** au lieu de 500 ; **make seed-admin** peut afficher un avertissement « compte déjà existant » sans erreur. En cas de 401 persistant (clé jamais générée), lancer **`make setup`** puis **`make up-full`**.

*Détail des phases et checklist complète : section 5 ci-dessous.*

### Prochaines étapes (ordre recommandé)

À faire dans l’ordre pour avancer sans blocage :

| # | Tâche | Livrable | Tests |
|---|--------|-----------|--------|
| 1 | ~~**Schéma DB pass**~~ | ~~`02-schema-pass.sql`~~ | ✅ Fait. |
| 2 | ~~**Backend password-manager**~~ | ~~Service 6051, CRUD vaults/items~~ | ✅ Fait (3 tests). |
| 3 | ~~**Intégration stack**~~ | ~~docker-compose, gateway `/pass`, make test~~ | ✅ Fait. |
| 3b | ~~**Dashboard : page Vaults**~~ | ~~Liste coffres, création, entrées (chiffrées)~~ | ✅ Fait (Vaults.tsx + tests). |
| 4 | **App Flutter Pass** (MVP) | App web + desktop Linux : login Cloudity, liste vaults/items, déchiffrement côté client. | Tests manuels ou intégration. |
| 5 | **Extension navigateur** (Manifest v3) | Lecture/ajout entrées, auto-fill simple. | Tests manuels. |
| 6 | **Phase 2 — Mail** | ~~Schéma mail~~, ~~mail-directory-service (Go)~~, gateway `/mail`. | ✅ Schéma + service + 4 tests. Reste : Postfix/Dovecot, mail-client-api, client Flutter. |

**Ensuite** : Phase 3 (alias), Phase 4 (Drive, E2E mail), Phase 5 (mobile, prod).

---

## 2. Vision du projet

Objectif : construire une suite **auto-hébergée, chiffrée et extensible** type :

- **Proton Mail** (mail E2E) + **Proton Pass** (gestionnaire de mots de passe)
- **Gmail** (client mail riche) + **Google Drive** (stockage fichier)

Le tout **dockerisé**, derrière Nginx Proxy Manager (prod) ou Nginx/Traefik en local, avec possibilité de passer en Swarm/K8s plus tard.

### 2.1 Les 4 domaines principaux

| Domaine | Rôle |
|--------|------|
| **Mail Core** | SMTP/IMAP (Postfix + Dovecot), stockage messages, alias, anti-spam (Rspamd), directory (PostgreSQL). |
| **Mail App** | Client web/mobile/Linux (Flutter), recherche, tags/dossiers, règles, rappels. |
| **Password Manager** | Type Bitwarden/Proton Pass : vault chiffré côté client, extensions navigateur, auto-fill, intégration alias mail. |
| **Core Cloudity** | Auth unifiée, comptes/organisations, quotas, futures apps (Drive). |

### 2.2 Stack technique cible (résumé)

- **Backend** : Go (auth, mail-directory, alias, API mail client, futur Drive), Python pour data/ETL si besoin. Postfix/Dovecot/Rspamd en briques externes.
- **Bases** : PostgreSQL (auth, mail, pass, drive), Redis (sessions, Rspamd).
- **Frontend** : Flutter (Web, Linux desktop, mobile Android/iOS) pour Mail + Password Manager ; extensions navigateur en JS/TS (Manifest v3).
- **Sécurité** : TLS 1.3, Argon2id, E2E côté client (vault pass, puis mail OpenPGP), audit logs, backups chiffrés.

### 2.3 Chiffrement — bonnes pratiques (référence unique)

**À utiliser partout dans Cloudity** : choix « best of the best » par usage.

| Usage | Algorithme / standard recommandé | Détail | Statut projet |
|--------|-----------------------------------|--------|----------------|
| **Mots de passe (hashing)** | **Argon2id** | Mémoire + CPU, résistant GPU/ASIC. Paramètres : au moins `time=2`, `memory=64 MiB`, `threads=2` (ou `argon2id.DefaultParams`). | ✅ auth-service (Argon2id + fallback bcrypt). |
| **Vault Pass / items (chiffrement E2E)** | **XChaCha20-Poly1305** (ou AES-256-GCM) | AEAD, nonce 192 bits (XChaCha) ou 96 bits (GCM). Clé dérivée avec **Argon2id** (salt aléatoire par vault/user). Format stocké : `nonce + ciphertext` (base64). | À faire côté client (Flutter / extension). |
| **Dérivation clé (master → clé de chiffrement)** | **Argon2id** + optional **HKDF** | Master key (ou mot de passe) → Argon2id(salt, 64 bytes) → HKDF pour obtenir clé XChaCha20 256 bits. | À faire dans app Pass. |
| **Transit (HTTPS)** | **TLS 1.3** | Pas de TLS &lt; 1.2. En prod : Nginx/Traefik, HSTS, cipher suites modernes (TLS_AES_256_GCM, ChaCha20_Poly1305). | Phase prod (Nginx Proxy Manager, TLS 1.3). |
| **JWT (signature)** | **RS256** ou **Ed25519** | Clé RSA 2048+ ou Ed25519. Ne pas utiliser HS256 avec secret partagé en multi-services. | auth-service (RSA). |
| **Mail E2E** | **OpenPGP** (RFC 4880) | Chiffrement symétrique session key + clé publique destinataire. Libs : OpenPGP.js (web), Flutter packages, etc. | Phase 4. |
| **Backups** | **AES-256** ou **ChaCha20** (restic/borg) | Restic : AES-256-GCM par défaut. Borg : ChaCha20 ou AES. Clé dérivée du mot de passe (Argon2/Scrypt). | Phase 5. |
| **Secrets / env** | **Pas de chiffrement dans le repo** | `.env` est dans `.gitignore` ; utiliser `.env.example` comme modèle. Si `.env` était déjà suivi par Git, lancer **`git rm --cached .env`** une fois (ou **`make create-env`**). Secrets en prod via variables d’environnement ou vault. |

**Résumé court**  
- **Hashing mots de passe** : Argon2id (déjà en place).  
- **Chiffrement vault / Drive (côté client)** : XChaCha20-Poly1305 + clé dérivée avec Argon2id.  
- **Transit** : TLS 1.3.  
- **JWT** : RS256 ou Ed25519.  
- **Mail E2E** : OpenPGP. **Backups** : restic/borg avec chiffrement intégré.

### 2.4 Plan DNS (production)

En production, exposer les services via un reverse proxy (Nginx Proxy Manager, Nginx ou Traefik) avec TLS. Plan DNS recommandé (exemple avec un domaine `cloudity.example.com`) :

| Sous-domaine | Service | Rôle |
|--------------|---------|------|
| **api.cloudity.example.com** | api-gateway (6080) | API unifiée (auth, admin, pass, mail). |
| **app.cloudity.example.com** | admin-dashboard (6001) | App web : landing, login, hub Drive/Pass/Mail, admin. |
| **auth.cloudity.example.com** | (optionnel) auth-service direct | Si accès direct auth utile (sinon tout via api.). |
| **mail.cloudity.example.com** | (Phase 2) Webmail / client | Client mail. |
| **pass.cloudity.example.com** | (optionnel) App Pass web | App Pass Flutter web. |

**À faire** : configurer les enregistrements A/AAAA (ou CNAME) vers le serveur hébergeant Docker ; configurer le proxy avec TLS 1.3 et HSTS ; en Phase 5 documenter les certificats (Let’s Encrypt) et la résolution DNS réelle.

---

## 3. Branches et base de travail

- **Branche principale** : `main` (à garder à jour avec `origin/main`).
- **Branches distantes connues** : `develop`, `feature/auth-service`, `release/v0.1`, `hotfix/base-upload`, `cursor/fix-cors-and-api-errors-on-dashboard-a59d`.
- **Recommandation** : travailler à partir de `main`, merger `develop` ou les features une fois validées. Avant de commencer une grosse phase, faire un `git fetch origin` et se baser sur la branche la plus à jour (en général `main`).

---

## 4. État actuel (ce qui existe déjà)

### 4.1 Infrastructure

| Élément | Statut | Note |
|--------|--------|------|
| Docker Compose global | ✅ Présent | `docker-compose.yml` + `docker-compose.services.yml` |
| PostgreSQL 15 | ✅ Présent | Volume, healthcheck ; schéma dans `infrastructure/postgresql/init.sql` |
| Dossier `infrastructure/postgresql/init/` | ✅ En place | `init/01-schema.sql` contient le schéma ; le Compose monte ce dossier. `init.sql` à la racine postgresql conservé pour référence. |
| `postgresql.conf` / `redis.conf` | ✅ Résolu | Mounts retirés du Compose ; Postgres/Redis utilisent la config par défaut → plus d’erreur au démarrage. |
| Redis 7 | ✅ Présent | Mot de passe (command + healthcheck via shell pour expansion `REDIS_PASSWORD`), volume, healthcheck |
| Réseau Docker | ✅ Présent | `cloudity-network` |

### 4.2 Ports (60XX) — exposition host

Tous les **ports exposés sur l’hôte** sont en **60XX** pour éviter les conflits et garder une convention claire. À utiliser dans le navigateur / clients :

| Service | Port host (60XX) | Port conteneur | Accès navigateur / usage |
|---------|------------------|----------------|---------------------------|
| PostgreSQL | 6042 | 5432 | Connexion DB (ex. `localhost:6042`) |
| Redis | 6079 | 6379 | Connexion Redis (ex. `localhost:6079`) |
| auth-service | 6081 | 8081 | Direct (débogage) ; en prod tout passe par la gateway. |
| **api-gateway** | **6080** | 8000 | **API principale** : `http://localhost:6080` (à mettre dans `VITE_API_URL` ; Chrome bloque 6000, ERR_UNSAFE_PORT). |
| admin-service | 6082 | 8082 | Direct (débogage) ; en prod via gateway `/admin/*`. |
| password-manager | 6051 | 8051 | Direct (débogage) ; en prod via gateway `/pass/*`. |
| **admin-dashboard** | **6001** | 3000 | **App web** : `http://localhost:6001` (/, /login, /register, /app, /admin). |
| Adminer (profil dev) | 6083 | 8080 | `http://localhost:6083` |
| Redis Commander (profil dev) | 6084 | 8081 | `http://localhost:6084` |

- **CORS** : l’api-gateway autorise `http://localhost:6001` et `http://localhost:5173` (ou `CORS_ORIGINS` dans l’env).
- **Nouveaux services** : exposer en 60XX (ex. mail-directory 6050, pass-manager 6051, mail-client-api 6052, etc.).

### 4.3 Schéma PostgreSQL actuel

- **Tables** : `tenants`, `users`, `sessions`, `audit_logs` (RLS activé).
- **À venir** : schémas/schema séparés ou tables pour **mail** (domains, mailboxes, aliases), **pass** (vaults, items), **drive** (fichiers, meta).

### 4.4 Services backend

| Service | Stack | Statut | Détail |
|---------|--------|--------|--------|
| auth-service | Go (Gin) | ✅ OK | Health, Register/Login/Refresh/Validate, 2FA TOTP ; Argon2id, refresh avec rotation, JWT ; tests unitaires (main_test.go). |
| api-gateway | Go (Gorilla mux) | ✅ OK | Proxy vers auth et admin, CORS ; exposé host **6080**. |
| admin-service | Python (FastAPI) | ✅ OK | CRUD tenants, CRUD users, **GET /admin/stats** (dashboard), health ; exposé host **6082** ; tests pytest (health, **stats**, tenants, users) — 21 tests. |
| **password-manager** | Go (Gin) | ✅ OK | Health, CRUD vaults, CRUD items (ciphertext uniquement) ; auth via X-User-ID / X-Tenant-ID (gateway) ; port **6051**, route gateway `/pass/*` ; tests Go (health, auth requis) — 3 tests. |
| mail-directory-service | Go (Gin) | ✅ OK | Domaines, comptes, alias (CRUD + API). Port **6050**, route gateway `/mail/*`. Health + GET/POST /mail/domains. |
| mail-client-api | — | ❌ À faire | Wrap IMAP/SMTP en REST/GraphQL pour l’UI (Phase 2). |
| password-manager | (voir ci-dessus) | ✅ OK | Service 6051 déjà en place. |
| calendar-service | Go (Gin) | ✅ OK | Événements (calendar_events). Port **6052**, route gateway `/calendar/*`. DB + auth X-User-ID. CRUD events. |
| notes-service | Go (Gin) | ✅ OK | Notes (table notes). Port **6053**, route gateway `/notes/*`. DB + auth X-User-ID. CRUD notes. |
| tasks-service | Go (Gin) | ✅ OK | Tâches et listes (task_lists, tasks). Port **6054**, route gateway `/tasks/*`. DB + auth X-User-ID. CRUD lists/tasks. |
| drive-service | Go (Gin) | ✅ OK | Fichiers et dossiers en cascade. Port **6055**, route gateway `/drive/*`. DB : `drive_nodes` (04-schema-drive.sql). CRUD nodes, upload/download. Auth via X-User-ID / X-Tenant-ID. |

### 4.5 Frontend & applications web (port 6001)

Une **seule app React** (frontend/admin-dashboard) sert à la fois l’accueil public, l’espace utilisateur et l’admin :

| Route / page | Rôle | Statut |
|--------------|------|--------|
| **/** | Landing publique : hero, présentation Drive/Pass/Mail, liens Connexion / Créer un compte | ✅ |
| **/login** | Connexion (email + mot de passe uniquement ; pas de champ Tenant ID visible) | ✅ |
| **/register** | Inscription (email + mot de passe) | ✅ |
| **/app** | Hub : tableau de bord avec liens vers Drive, Pass, Mail | ✅ |
| **/app/drive** | Drive : dossiers et fichiers en cascade (breadcrumb, nouveau dossier, téléverser, renommer, supprimer, télécharger) | ✅ |
| **/app/pass** | Pass web : coffres et entrées (même API que admin, déchiffrement côté client à venir) | ✅ |
| **/app/mail** | Interface Mail (placeholder : dossiers, liste, à brancher sur mail-client-api) | ✅ |
| **/app/settings** | Paramètres utilisateur (session) ; à enrichir (profil, préférences, etc.) | ✅ |
| **/admin** | Administration : tableau de bord, Tenants, Users, Vaults, Domaines mail, Settings | ✅ |

**Connexion** : l’utilisateur se connecte avec **email + mot de passe** uniquement. Le frontend envoie `tenant_id: 1` par défaut à l’API (backend actuel exige encore `tenant_id`). Une évolution backend (ex. résolution du tenant par domaine email ou endpoint dédié) permettra de supprimer complètement la notion de tenant côté utilisateur.

**Design** : Tailwind CSS, palette brand/slate, typo DM Sans, sidebar claire pour l’app et l’admin.

**Applications web comme modules** : Les fonctionnalités (Drive, Pass, Agenda, Notes, Tâches, Admin) sont conçues comme **modules intégrés** au projet principal Cloudity. Chaque module correspond à une ou plusieurs routes sous `/app/*` ou `/admin`, à un service backend dédié (drive-service, password-manager, calendar-service, etc.) et à une API sous le gateway (`/drive/*`, `/pass/*`, `/calendar/*`, etc.). Le shell commun (admin-dashboard) fournit l’auth, la navigation et le layout ; les pages de chaque module chargent leurs données via l’API unique (`VITE_API_URL`). Pour étendre Cloudity : ajouter une route, une page React (éventuellement lazy-loaded), et un backend + route gateway si besoin. Les futures apps Flutter ou PWA pourront réutiliser les mêmes APIs en tant que clients alternatifs.

| App / cible | Stack | Statut | Détail |
|-------------|--------|--------|--------|
| **App web unifiée** (6001) | React (Vite, TanStack Query, Tailwind) | ✅ OK | Landing, login, register, hub Drive/Pass/Mail, admin sous /admin. |
| Mail (web/desktop) | Flutter | ❌ À faire | Phase 2 (client riche). |
| Password Manager (desktop) | Flutter | ❌ À faire | Phase 1 (optionnel si web Pass suffit). |
| Extensions navigateur (Pass) | JS/TS Manifest v3 | ❌ À faire | Phase 1 (MVP) puis Phase 3 (alias). |
| admin_app (mobile) | Flutter | 🟡 Squelette | Structure de base uniquement. |
| Apps mobiles Mail / Pass | Flutter | ❌ À faire | Après MVP web/desktop. |

### 4.6 Scripts et outillage

- `scripts/setup.sh` : setup initial (dossiers, .env, clés, deps) → puis `make up`.
- `scripts/setup-dev.sh` : deps locales pour dev (Go, Node, Python).
- `scripts/diagnose.sh` : vérification structure + ports 60XX.
- `scripts/fix-project.sh` : réparation .env, go.mod, frontend minimal.
- À prévoir : migrations DB versionnées (ex. golang-migrate ou `infrastructure/postgresql/migrations/*.sql`).

### 4.7 Base pour avancer (à étendre)

| Composant | Rôle | Prochaine étape |
|-----------|------|------------------|
| **admin-dashboard** (React/Vite) | UI admin actuelle | Renforcer (tenants, users, settings) ; servir de modèle pour Mail/Pass UI. |
| **admin-service** (FastAPI) | CRUD tenants, API admin | Étendre (users, rôles) ; même pattern pour mail-directory et password-manager. |
| **auth-service** (Go) | Login, register, JWT, 2FA | Consolider (Argon2id, refresh tokens) puis brancher tous les fronts. |
| **api-gateway** (Go) | Route /auth, /admin, CORS | Ajouter routes /mail, /pass, /drive au fur et à mesure. |

Pour **Mail Core** : ajouter Postfix, Dovecot, Rspamd + **mail-directory-service** (Go) + schéma DB mail.  
Pour **Password Manager** : ajouter **password-manager-service** (Go) + schéma pass + app Flutter + extension navigateur.  
Voir checklist Phase 1 et Phase 2 ci-dessous.

---

## 5. Roadmap par phases (checklist détaillée)

Les phases ci-dessous sont alignées avec la vision “Proton Mail + Pass + Gmail + Drive” et le plan d’implémentation détaillé. **Cocher au fur et à mesure** pour suivre l’avancement.

### Phase 0 — Infra commune

- [x] Repo / structure : docker-compose global (Postgres, Redis, auth, gateway, admin, dashboard).
- [x] Fichiers `postgresql.conf` et `redis.conf` : mounts retirés du Compose (config par défaut) → démarrage sans erreur.
- [x] Init PostgreSQL fiable : scripts dans `infrastructure/postgresql/init/` (01-schema.sql, 02-schema-pass.sql).
- [ ] Templates ou structure type pour nouveaux services (Go backend, Flutter front).
- [ ] Migrations DB versionnées : dossier `infrastructure/postgresql/migrations/` + README en place ; outil (golang-migrate/Flyway) à intégrer si besoin.

### Phase 1 — Auth + Password Manager MVP

- [x] **Auth Cloudity** : login/register, Argon2id, JWT + refresh tokens (rotation), 2FA TOTP (auth-service).
- [x] **Password Manager backend** (Go) : CRUD vaults/items, auth via gateway, stockage blobs chiffrés côté client.
- [x] **DB** : schéma `pass` (pass_vaults, pass_items) dans 02-schema-pass.sql.
- [ ] **Front Flutter** : Web + Desktop Linux (liste, CRUD mots de passe, déchiffrement côté client).
- [ ] **Extension navigateur** (Brave/Chrome) : lecture/ajout d’entrées, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis + PostgreSQL (Docker Compose).
- [x] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API). Health + GET/POST /mail/domains.
- [x] **Schéma DB mail** : domains, mailboxes, aliases dans 03-schema-mail.sql.
- [ ] **UI admin** (web) : gestion comptes/alias mail.
- [ ] **mail-client-api** : expose IMAP/SMTP en REST/GraphQL pour le client.
- [ ] **Client mail Flutter** : Web + Linux (lecture/envoi, dossiers, étiquettes, règles simples type Sieve).

### Phase 3 — Intégration alias + Password Manager

- [ ] **API alias** unifiée dans mail-directory-service (création alias temporaire/permanent, expiration).
- [ ] **Extension Pass** : bouton “Créer alias” → appel API → remplissage champ email + stockage dans vault.
- [ ] **UI Cloudity** : vue centralisée alias, règles de forwarding, expiration.

### Phase 4 — E2E mail + Drive

- [ ] **Mail E2E** : chiffrement OpenPGP pour mails Cloudity–Cloudity (gestion clés, import/export).
- [ ] **Drive** : service stockage (fichiers chiffrés côté client, meta en DB, stockage objet ou FS).
- [ ] **Client Drive** : Flutter (web/desktop/mobile) + intégration avec le reste de la suite.

### Phase 5 — Mobile et finalisation

- [ ] **Apps mobiles** : Mail et Password Manager (Flutter) pour Android/iOS.
- [ ] **Sync** : cohérence multi-app (vault, mail, drive).
- [ ] **Sécurité** : audit logs, backups chiffrés (ex. restic/borg), tests de restauration.
- [ ] **Prod** : Nginx Proxy Manager (ou Nginx/Traefik), TLS 1.3, HSTS, headers sécurité, rate limiting.

---

## 6. Migrations et nettoyage à faire

- [x] **Init PostgreSQL** : le schéma initial est dans `infrastructure/postgresql/init/01-schema.sql` ; le Compose monte ce dossier.
- [x] **Ports 60XX** : tous les services exposés en 60XX (6042, 6079, 6081, **6080** (API), 6082, 6001, 6083, 6084) ; `VITE_API_URL=http://localhost:6080` et CORS mis à jour.
- [ ] **Alignement schéma auth** : `users.tenant_id` (INTEGER vs UUID), retour de `uuid` vs `id` selon les services (auth-service utilise `id` dans l’INSERT).
- [ ] **Migrations DB versionnées** : dossier `infrastructure/postgresql/migrations/` + README créés ; appliquer les migrations à la main ou via outil (golang-migrate, Flyway).
- [ ] **Branches** : travailler depuis `main` ; merger `develop` / `feature/*` une fois validé.
- [ ] **Login par email seul (sans tenant)** : côté backend, optionnel — résolution du tenant par domaine email ou endpoint (ex. GET /auth/tenants?email=…) pour que l’utilisateur n’ait jamais à saisir d’organisation. Actuellement le frontend envoie `tenant_id: 1` par défaut.
- [ ] **Documentation** : garder `PlanImplementation.md` pour la vision long terme ; **STATUS.md** = référence quotidienne de suivi.

---

## 7. Références croisées

- **Vision détaillée** : décrite dans la demande (Mail Core, Mail App, Password Manager, Core Cloudity, stack, roadmap).
- **Plan global** : `PlanImplementation.md` (phases 1–6, métriques, ressources).
- **Architecture technique** : `README.md` (schémas, exemples de code, stack cible).
- **Docker** : `docker-compose.yml` (dev complet), `docker-compose.services.yml` (services seuls).

---

*Ce fichier sert de **référence unique** pour l’avancement du projet CLOUDITY. Mettre à jour les cases et la date à chaque avancée significative.*
