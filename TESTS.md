# CLOUDITY — Référence des tests

**Objectif** : tout tester (API, frontend, E2E). Les tests unitaires/applicatifs passent par **`make test`**. Les E2E sont **à part** : **`make test-e2e`** (après `make up`).

**Règle** : à chaque nouvelle fonctionnalité, ajouter les tests adéquats exécutables par `make test`. Ne pas merger sans tests associés.

---

## 1. Commandes

| Commande | Rôle |
|----------|------|
| **`make test`** | **Uniquement** tests unitaires + applicatifs (pas d’E2E). Lance : auth-service, api-gateway, password-manager (Go), admin-service (pytest), admin-dashboard (Vitest). À lancer avant chaque merge/feature. |
| **`make test-e2e`** | **Tests E2E séparés.** Vérifie que les services répondent (health, gateway proxy, dashboard). **Prérequis : `make up`** puis **attendre 20-30 s** que tous les services soient healthy. |
| **`make tests`** | **TOUT** : unit/app + E2E (health/proxy) + **E2E Playwright** (navigateur) + sécurité. Génère un rapport dans `reports/`. **Prérequis : `make up`**, **`make seed-admin`**, attendre 20-30 s. |
| **`make test-e2e-playwright`** | **Tests E2E navigateur (Playwright).** Simule un utilisateur réel : login, Hub, Drive, Office. **Prérequis : `make up`**, **`make seed-admin`**, 20-30 s. |
| **`make test-all`** | Même enchaînement que **`make tests`** (test + test-e2e + test-e2e-playwright + test-security) mais sans rapport fichier. |
| **`make test-security`** | Audits de dépendances (npm audit, safety, govulncheck) + checks auth : `/auth/validate` sans token ou avec token invalide → 401. |
| **`make test-docker`** | Même batterie que `make test` mais exécutée dans les conteneurs (après `make up`). |

**Pourquoi attendre 20-30 s après `make up` ?** Le **api-gateway** a un `depends_on` avec **condition: service_healthy** sur **auth-service**, **admin-service** et **password-manager**. Docker ne démarre le gateway qu'une fois ces trois services healthy. Comptez ~20-30 s après le démarrage pour que tout soit prêt.

**En résumé** : **`make tests`** ou **`make test-all`** = test + E2E + E2E Playwright + sécurité. **`make test-full`** = test-all + test-docker. Pour tout lancer : **`make up`**, **`make seed-admin`**, attendre 20-30 s, puis **`make tests`** (avec rapport) ou **`make test-all`**.

**Ce que `make tests` couvre** : (1) **Phase 1** — tests unitaires et applicatifs (Go, pytest, Vitest) ; (2) **Phase 2** — E2E health/proxy (stack up) ; (3) **Phase 3** — E2E Playwright (navigateur : auth, Hub, Drive, Office, Pass, Mail, éditeur) ; (4) **Phase 4** — sécurité (npm audit, safety, govulncheck, checks auth).

**Résumé en console** : À la fin de **`make tests`**, le script affiche le **RÉSUMÉ** (Unit/App, E2E, E2E Playwright, Sécurité) et le **RÉSULTAT FINAL** (SUCCÈS ou ÉCHEC). En cas d’avertissements sécurité, la ligne indique « vulnérabilités signalées » et précise que les détails sont dans le rapport. Le chemin du rapport détaillé est indiqué (ex. `reports/test-YYYYMMDD-HHMMSS.log`).

**Drive et fichiers « 0 octet » / nettoyage** :  
- **Tests unitaires (Vitest)** : toutes les appels API Drive sont **mockés** ; aucun fichier ni dossier n’est créé en base. Les réponses mockées utilisent `size: 0` pour les nœuds fichier (documents vides à la création), ce qui reflète le comportement réel de l’API.  
- **E2E Playwright** : les scénarios Drive qui créent des dossiers ou téléversent des fichiers **mockent l’API** (route `**/drive/nodes**`) pour ne pas créer de ressources réelles. Le test « Téléverser : file chooser » envoie un fichier vers l’API ; **si l’API est réelle, un fichier peut être créé**. Pour éviter tout fichier résiduel en CI, mocker dans ce test les requêtes POST (création nœud) et PUT (contenu) vers `/drive/nodes` (voir exemples dans les autres tests du fichier).  
- Si vous lancez des E2E contre l’API réelle (sans mocks), des dossiers/fichiers peuvent être créés ; dans ce cas, un nettoyage manuel ou un script post-test peut être nécessaire (non fourni par défaut).

---

## 2. Ce que `make test` exécute (référence)

| Service | Type | Commande | Fichiers | Nombre de tests |
|---------|------|----------|----------|------------------|
| **auth-service** | API (Go) | `go test ./...` | `backend/auth-service/main_test.go` | 15 |
| **api-gateway** | API (Go) | `go test ./...` | `backend/api-gateway/main_test.go` | 7 |
| **password-manager** | API (Go) | `go test ./...` | `backend/password-manager/main_test.go` | 3 |
| **mail-directory-service** | API (Go) | `go test ./...` | `backend/mail-directory-service/main_test.go` | 4 |
| **drive-service** | API (Go) | `go test ./...` | `backend/drive-service/main_test.go` | 4 |
| **admin-service** | API (Python) | `pytest tests/` | `backend/admin-service/tests/*.py` | 21 |
| **admin-dashboard** | Frontend (Vitest) | `npm run test` | **19 fichiers** (AppHub, AppLayout, CalendarPage, DocumentEditorPage (17 tests), DrivePage, api, …) | **79+** |

**Total actuel** : **133 tests** (tous lancés par `make test`).

**Exclusion E2E** : les specs Playwright dans `e2e/**` sont exclues de Vitest (`vite.config.js` → `test.exclude: ['e2e/**']`). Les tests E2E **navigateur** se lancent avec **`npm run test:e2e`** dans `frontend/admin-dashboard` ou **`make test-e2e-playwright`** depuis la racine.

**401 en manuel sur /pass/vaults ou /mail/domains (admin)** : en runtime, la gateway a besoin de la clé publique JWT (`public.pem`). Exécuter **`make setup`** puis **`make up-full`** pour que Pass et Domaines admin fonctionnent avec un token valide.

---

## 3. Détail par couche

### 3.1 API — Backend (Go)

| Fichier | Ce qui est testé |
|---------|-------------------|
| **auth-service/main_test.go** | Health ; hash mot de passe (Argon2id/bcrypt) ; JWT generate/parse ; register ; login succès/échec ; validate token ; refresh ; 2FA enable/verify (**verify avec code invalide → 401**) ; **loadRSAKeys écrit public.pem quand clé générée en dev**. |
| **api-gateway/main_test.go** | Health (GET, method, OPTIONS) ; routage `/auth/*`, `/admin/*`, `/pass/*`, **`/mail/*`** ; **CORS** (Origin → Access-Control-Allow-Origin). |
| **password-manager/main_test.go** | Health ; `/pass/vaults` sans `X-User-ID` → 401 ; `X-User-ID` invalide → 401. |
| **mail-directory-service/main_test.go** | Health ; `/mail/health` ; `/mail/domains` sans `X-Tenant-ID` → 401 ; `X-Tenant-ID` invalide → 401. |
| **drive-service/main_test.go** | Health ; GET /drive/nodes sans `X-User-ID` → 401 ; **GET /drive/nodes/recent sans X-User-ID → 401** ; GET /drive/nodes/:id/content sans X-User-ID → 401 ; PUT /drive/nodes/:id/content sans X-User-ID → 401. |

### 3.2 API — Backend (Python, admin-service)

| Fichier | Ce qui est testé |
|---------|-------------------|
| **tests/test_health.py** | GET /health → 200, JSON, champ `status` ; POST /health → 405 ou 200. |
| **tests/test_stats.py** | GET /admin/stats → 200 ; champs `active_tenants`, `total_users`, `api_calls_today` ; valeurs ≥ 0. |
| **tests/test_tenants.py** | Liste tenants (skip/limit) ; get by id 404 ; create (validation, champs manquants, succès) ; delete 404. |
| **tests/test_users.py** | Liste users par tenant (skip/limit) ; get user 404 ; update (validation, payload valide, body vide, is_active). |

### 3.3 Frontend — admin-dashboard (Vitest)

| Fichier | Ce qui est testé |
|---------|-------------------|
| **src/api.test.ts** | `apiUrl` ; `fetchTenants`, … ; **`createDriveFile`**, **`createDriveFileWithUniqueName`** (retry 409 et 500 duplicate → nom unique), **`getDriveNodeContentAsText`**, **`fetchDriveRecentFiles`**, **`putDriveNodeContent`**, … ; **`moveDriveNode`**. |
| **src/authContext.test.tsx** | `isAuthenticated` sans storage ; bouton Logout ; restauration auth depuis `localStorage`. |
| **src/App.test.tsx** | Rendu login si non authentifié ; logout → login + clear storage ; hub /app ; routes /app/calendar, /app/notes, /app/tasks (titres **Agenda**, **Notes**, **Tâches** + sous-titres statiques). |
| **src/pages/app/AppHub.test.tsx** | Titre et sous-titre ; 6 cartes (Drive, Pass, Mail, Calendar, Notes, Tasks) ; liens vers les bonnes routes ; textes « à venir » pour Calendar, Notes, Tasks. |
| **src/pages/app/CalendarPage.test.tsx** | Titre **Agenda**, breadcrumb Tableau de bord ; état vide « Aucun événement » (mock useAuth + API). |
| **src/pages/app/NotesPage.test.tsx** | Titre **Notes**, breadcrumb Tableau de bord ; état vide « Aucune note » (mock useAuth + API). |
| **src/pages/app/TasksPage.test.tsx** | Titre **Tâches**, breadcrumb Tableau de bord ; état vide « Aucune tâche » (mock useAuth + API). |
| **src/pages/Dashboard.test.tsx** | Titre ; chargement puis stats (active_tenants, total_users, api_calls_today) ; non authentifié ; erreur. |
| **src/pages/Login.test.tsx** | Formulaire (email, password, tenant) ; appel login + setAuth en succès ; pas d’appel si tenant invalide. |
| **src/pages/Tenants.test.tsx** | Chargement puis liste tenants ; non authentifié ; erreur fetch. |
| **src/pages/Users.test.tsx** | Liste users ; non authentifié ; erreur. |
| **src/pages/Settings.test.tsx** | Rendu Settings ; non authentifié ; erreur. |
| **src/pages/Vaults.test.tsx** | Titre Vaults ; chargement puis liste coffres ; non authentifié ; champ + bouton création. |
| **src/pages/Domaines.test.tsx** | Titre Domaines mail ; chargement puis liste domaines ; non authentifié ; champ + bouton Ajouter. |
| **src/pages/app/DrivePage.test.tsx** | Titre Drive, breadcrumb, Téléverser, **Nouveau fichier** (menu Document / Tableur / Présentation), Nouveau dossier ; formulaire Nouveau dossier ; **création dossier** (nom + Créer → createDriveFolder) ; **création sous-dossier** (dans un dossier, Nouveau dossier → createDriveFolder avec parent_id) ; état vide ; chaîne avec AppLayout (inputs fichier/dossier, overlay) ; **clic sur nom de fichier éditable (.txt/.md/.html/.csv) ouvre l’éditeur**. Trois tests skippés : menu trois points (Télécharger, Renommer, Corbeille) et modale Corbeille / Renommer — menu rendu en portal (document.body), non affiché en jsdom. **Récents** : bouton Récents, section à la racine (une ligne, toggle, cartes), vue Récents (sous-catégorie, regroupement par jour). |
| **src/layouts/AppLayout.test.tsx** | **getAppBreadcrumb** : sur l’éditeur renvoie « Tableau de bord > Drive » (pas Office ni Éditeur) ; sur /app/drive et /app. |
| **src/pages/app/DocumentEditorPage.test.tsx** | Identifiant invalide ; fil d'Ariane (Drive, nom, Renommer) ; barre menus ; Renommer/Supprimer ; **modales Lien, Tableau, Quitter (sans enregistrer)** ; Fermer depuis Office/Drive ; helpers. |
| **src/performance.test.tsx** | Rendu DrivePage avec ~80 nœuds ; AppHub ; clic Nouveau dossier réactif ; clic Téléverser. |

### 3.4 E2E — scripts/test-e2e.sh

Lancé par **`make test-e2e`** (stack up requise).

| Vérification | URL / détail |
|--------------|---------------|
| **API Gateway /health** | `http://localhost:6080/health` |
| Auth Service /health | `http://localhost:6081/health` |
| Admin Service /health | `http://localhost:6082/health` |
| **Password Manager /health** | `http://localhost:6051/health` |
| **Mail Directory /health** | `http://localhost:6050/health` |
| Dashboard | `http://localhost:6001/` |
| Gateway → health JSON | `GET /health` contient `"status"` |
| Gateway → /auth/health | `GET /auth/health` contient `"status"` (avec retry) |
| Gateway → /admin/stats | `GET /admin/stats` contient `"active_tenants"` |
| Gateway → /pass/health | `GET /pass/health` contient `"status"` (avec retry) |
| Gateway → /mail/health | `GET /mail/health` contient `"status"` (avec retry) |
| **Gateway → /drive/health** | `GET /drive/health` contient `"status"` (avec retry) |
| **Gateway → POST /auth/login (invalid)** | 401 ou 400 (check fonctionnel) |
| **Gateway → GET /auth/validate (no token)** | 401 (check fonctionnel) |

### 3.5 E2E — Playwright (navigateur)

Lancé par **`make test-e2e-playwright`** ou **`cd frontend/admin-dashboard && BASE_URL=http://localhost:6001 npm run test:e2e`**. **Prérequis** : stack up (**`make up`**), compte démo créé (**`make seed-admin`**), attendre 20-30 s.

Les tests simulent un **utilisateur réel** : ouverture du dashboard, connexion, navigation Hub → Drive / Office, création de fichier et de dossier, téléversement, ouverture d’un document dans l’éditeur.

**Couvert actuellement** : login (succès / échec), Hub (liens Drive/Office, navigation), Drive (titre, menu Nouveau fichier, formulaire Nouveau dossier, Téléverser + overlay), **Office** (cartes colorées Nouveau document / Tableur / Présentation, Récemment modifiés), **Pass** (titre, Nouveau coffre, fil d’Ariane). Certains scénarios (création document/dossier depuis le navigateur, breadcrumb, suppression, sauvegarde éditeur) sont **skippés** en E2E quand l’API Drive n’est pas joignable depuis le navigateur (voir message de skip dans les specs).

**À couvrir plus tard (idées)** : Mail (domaines), création coffre Pass, réactiver les tests skippés quand l’env E2E permet les appels API.

| Fichier | Ce qui est testé |
|---------|-------------------|
| **e2e/auth.spec.ts** | Page login ; identifiants invalides → message d’erreur ; compte démo → redirection vers `/app` (tableau de bord). |
| **e2e/hub.spec.ts** | Après login : liens Drive / Office ; clic Drive → `/app/drive` ; clic Office → `/app/office`. |
| **e2e/drive.spec.ts** | Titre, boutons ; menu Nouveau fichier ; formulaire Nouveau dossier ; **Téléverser puis nettoyage (sélection + suppression)** ; **breadcrumb + nettoyage (suppression dossier mocké)**. Tests skippés : Nouveau fichier → Document, suppression (API). |
| **e2e/office.spec.ts** | Cartes colorées Nouveau document / Tableur / Présentation (data-testid office-card-*) ; section Récemment modifiés ou lien Drive. Test skippé : création document (API). |
| **e2e/pass.spec.ts** | Titre Pass, bouton Nouveau coffre, fil d’Ariane (Tableau de bord, Pass). |
| **e2e/editor.spec.ts** | **Ouverture éditeur par URL (mock)** : modale **Lien** (popup custom), modale **Tableau** ; **modale Quitter** (Annuler reste, Quitter redirige). Test skippé : sauvegarde manuelle. |

Credentials : `admin@cloudity.local` / `Admin123!` (surchargeables via `PLAYWRIGHT_E2E_EMAIL` et `PLAYWRIGHT_E2E_PASSWORD`). Config : **`frontend/admin-dashboard/playwright.config.ts`** (baseURL, timeout 45 s, workers 1).

## 4. Tests à faire / à ajouter au fur et à mesure

Cocher au fil de l’eau. Tout doit rester exécutable via **`make test`** (ou `make test-e2e` pour les E2E).  
**Voir aussi** : [STATUS.md § 1b](STATUS.md) (Drive, éditeur, corbeille) pour la roadmap et les tests associés à chaque fonctionnalité.

### 4.0 Drive, éditeur, corbeille (roadmap STATUS.md § 1b)

- [ ] **Recherche Drive / globale** : unit (logique recherche, filtres) ; E2E (saisie → résultats Drive puis autres modules).
- [ ] **Visualisation PDF** : unit (composant viewer) ; E2E (ouvrir un PDF depuis le Drive).
- [ ] **Extracteur d’archives** : API Go (endpoint extract, structure dossiers) ; E2E (upload archive → extraction → structure).
- [ ] **Éditeur : renommer document** : unit (renommage + sync nom) ; E2E (créer doc → ouvrir → renommer → vérifier Drive).
- [ ] **Éditeur : export PDF** : unit (génération ou appel export) ; E2E (éditeur → Export PDF → téléchargement).
- [ ] **Éditeur : supprimer document** : unit (action supprimer + redirection) ; E2E (ouvrir doc → supprimer → Drive / corbeille).
- [ ] **Corbeille unifiée** : API (schéma DB, list trash, restore, purge) ; E2E (supprimer → corbeille → restaurer).
- [ ] **Corbeille : vider / purge** : API + E2E.

### 4.1 API (backends)

- [x] **auth-service** : test refresh token rotation (déjà dans TestRefreshTokenHandler) ; **test 2FA verify avec code invalide**.
- [x] **api-gateway** : **test CORS** (header Origin) ; test 401 sur `/admin/*` sans token (si applicable).
- [ ] **password-manager** : test listVaults avec DB (intégration) ; test createVault ; test listItems / addItem / deleteItem (avec mock DB ou testcontainer).
- [ ] **admin-service** : test GET /admin/tenants avec header Authorization (si ajout auth) ; test edge cases sur stats (audit_logs vide).

### 4.2 Frontend (admin-dashboard)

- [x] **api.test.ts** : `fetchVaultItems` (GET /pass/vaults/:id/items) ; erreur 404.
- [ ] **Vaults.test.tsx** : clic sur un coffre → chargement des items ; création coffre → liste mise à jour (mutation).
- [ ] **Tenants** : test bouton "Create Tenant" (modal ou navigation).
- [ ] **Users** : test filtres ou pagination si ajoutés.
- [ ] **Settings** : test sauvegarde si formulaire ajouté.
- [ ] Tests accessibilité (roles, labels) sur les pages principales.

### 4.3 E2E

- [x] **test-e2e.sh** : check direct Password Manager (port 6051) ; retry sur /auth/health et /pass/health.
- [x] **E2E Playwright** : suite navigateur documentée (**`make test-e2e-playwright`**) — auth, hub, drive, office (voir § 3.5).
- [ ] **test-e2e.sh** : scénario login via gateway (POST /auth/login) puis GET /admin/tenants avec token (optionnel, plus lourd).

### 4.4 Nouveaux services (quand ajoutés)

- [ ] **mail-directory-service** : health + CRUD domaines (**déjà** : listDomains, createDomain) ; **ajouté au make test**. Boîtes et alias à venir.
- [ ] **Flutter Pass** : tests unitaires / widget / intégration ; commande dans Makefile si possible.
- [ ] **Extension navigateur** : tests unitaires (Jest/Vitest) ; pas bloquant pour `make test` si pas dans le repo principal.

### 4.5 Tests sécurité (`make test-security`)

- [x] **scripts/test-security.sh** : exécute **dans Docker** — **npm audit** (conteneur admin-dashboard), **safety** (conteneur admin-service, avec `pip install safety` si besoin), **govulncheck** (conteneurs Go : auth-service, api-gateway, password-manager, mail-directory-service, calendar-service, notes-service, tasks-service, drive-service). Aucune installation sur la machine hôte n’est requise.
- [x] **Checks auth** : GET /auth/validate sans token → 401 ; avec token invalide → 401 (si gateway up).
- [ ] Optionnel : rate limiting, headers sécurité (CORS, X-Frame-Options), scan dépendances dans CI.

---

## 5. Récap

- **Lancer tous les tests** : **`make test`** (unit/app uniquement).
- **Lancer tout (unit + E2E + E2E Playwright + sécurité)** : **`make up`**, **`make seed-admin`**, attendre 20-30 s, puis **`make tests`** (rapport dans `reports/`) ou **`make test-all`**.
- **Lancer tout + tests dans les conteneurs** : **`make test-full`** (stack up requise).
- **Lancer les E2E seuls** : `make up` puis `make test-e2e`.
- **Lancer les E2E navigateur (Playwright)** : `make up`, `make seed-admin`, attendre 20-30 s, puis **`make test-e2e-playwright`**.
- **Sécurité** : `make test-security`.
- **Ajouter un test** : créer ou modifier le fichier de test du bon service, puis vérifier que `make test` le prend en compte.
- **Nouveau backend** : ajouter une cible dans le Makefile (ex. `password-manager` déjà présent) et documenter ici.
- **Nouveau frontend** : ajouter les fichiers `*.test.ts` / `*.test.tsx` dans le projet Vitest existant (ou équivalent) et garder `make test` qui lance `npm run test` pour ce frontend.

*Ce fichier sert de référence pour savoir quoi tester et quels tests ajouter au fur et à mesure. Mettre à jour les comptes et les cases quand des tests sont ajoutés.*
