# CLOUDITY — Référence des tests

**Objectif** : tout tester (API, frontend, E2E). Les tests unitaires/applicatifs passent par **`make test`**. Les E2E sont **à part** : **`make test-e2e`** (après `make up`).

**Règle** : à chaque nouvelle fonctionnalité, ajouter les tests adéquats exécutables par `make test`. Ne pas merger sans tests associés.

---

## 1. Commandes

| Commande | Rôle |
|----------|------|
| **`make test`** | **Uniquement** tests unitaires + applicatifs (pas d’E2E). Lance : auth-service, api-gateway, password-manager (Go), admin-service (pytest), admin-dashboard (Vitest). À lancer avant chaque merge/feature. |
| **`make test-e2e`** | **Tests E2E séparés.** Vérifie que les services répondent (health, gateway proxy, dashboard). **Prérequis : `make up`** puis **attendre 20-30 s** que tous les services soient healthy. |
| **`make test-all`** | Lance **`make test`** puis **`make test-e2e`** (tout en une commande ; E2E échoue si la stack n'est pas up). |
| **`make test-security`** | Audits de dépendances (npm audit, safety, govulncheck) + checks auth : `/auth/validate` sans token ou avec token invalide → 401. |
| **`make test-docker`** | Même batterie que `make test` mais exécutée dans les conteneurs (après `make up`). |

**Pourquoi attendre 20-30 s après `make up` ?** Le **api-gateway** a un `depends_on` avec **condition: service_healthy** sur **auth-service**, **admin-service** et **password-manager**. Docker ne démarre le gateway qu'une fois ces trois services healthy. Comptez ~20-30 s après le démarrage pour que tout soit prêt.

**En résumé** : **`make test-all`** = test (113+) + E2E + sécurité. **`make test-full`** = test-all + test-docker. Pour tout lancer : `make up`, attendre 20-30 s, puis **`make test-all`** (ou **`make test-full`** pour inclure les tests dans les conteneurs).

---

## 2. Ce que `make test` exécute (référence)

| Service | Type | Commande | Fichiers | Nombre de tests |
|---------|------|----------|----------|------------------|
| **auth-service** | API (Go) | `go test ./...` | `backend/auth-service/main_test.go` | 15 |
| **api-gateway** | API (Go) | `go test ./...` | `backend/api-gateway/main_test.go` | 7 |
| **password-manager** | API (Go) | `go test ./...` | `backend/password-manager/main_test.go` | 3 |
| **mail-directory-service** | API (Go) | `go test ./...` | `backend/mail-directory-service/main_test.go` | 4 |
| **drive-service** | API (Go) | `go test ./...` | `backend/drive-service/main_test.go` | 2 |
| **admin-service** | API (Python) | `pytest tests/` | `backend/admin-service/tests/*.py` | 21 |
| **admin-dashboard** | Frontend (Vitest) | `npm run test` | 14 fichiers (AppHub, CalendarPage, NotesPage, TasksPage, App, …) | 61 |

**Total actuel** : 113+ tests (tous lancés par `make test`).

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
| **drive-service/main_test.go** | Health ; GET /drive/nodes sans `X-User-ID` → 401. |

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
| **src/api.test.ts** | `apiUrl` ; `fetchTenants`, `fetchUsers`, `fetchDashboardStats`, `fetchVaults`, `createVault`, `fetchVaultItems`, **`fetchDomains`**, **`createDomain`**, `login` (appels fetch, erreurs). |
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
| **Gateway → POST /auth/login (invalid)** | 401 ou 400 (check fonctionnel) |
| **Gateway → GET /auth/validate (no token)** | 401 (check fonctionnel) |

---

## 4. Tests à faire / à ajouter au fur et à mesure

Cocher au fil de l’eau. Tout doit rester exécutable via **`make test`** (ou `make test-e2e` pour les E2E).

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
- [ ] **test-e2e.sh** : scénario login via gateway (POST /auth/login) puis GET /admin/tenants avec token (optionnel, plus lourd).
- [ ] Documenter ou script E2E navigateur (Playwright/Cypress) si besoin plus tard.

### 4.4 Nouveaux services (quand ajoutés)

- [ ] **mail-directory-service** : health + CRUD domaines (**déjà** : listDomains, createDomain) ; **ajouté au make test**. Boîtes et alias à venir.
- [ ] **Flutter Pass** : tests unitaires / widget / intégration ; commande dans Makefile si possible.
- [ ] **Extension navigateur** : tests unitaires (Jest/Vitest) ; pas bloquant pour `make test` si pas dans le repo principal.

### 4.5 Tests sécurité (`make test-security`)

- [x] **scripts/test-security.sh** : npm audit (admin-dashboard), safety (admin-service si installé), govulncheck (Go si installé).
- [x] **Checks auth** : GET /auth/validate sans token → 401 ; avec token invalide → 401 (si gateway up).
- [ ] Optionnel : rate limiting, headers sécurité (CORS, X-Frame-Options), scan dépendances dans CI.

---

## 5. Récap

- **Lancer tous les tests** : `make test`.
- **Lancer tout (unit + E2E + sécurité)** : `make up`, attendre 20-30 s, puis **`make test-all`**.
- **Lancer tout + tests dans les conteneurs** : **`make test-full`** (stack up requise).
- **Lancer les E2E seuls** : `make up` puis `make test-e2e`.
- **Sécurité** : `make test-security`.
- **Ajouter un test** : créer ou modifier le fichier de test du bon service, puis vérifier que `make test` le prend en compte.
- **Nouveau backend** : ajouter une cible dans le Makefile (ex. `password-manager` déjà présent) et documenter ici.
- **Nouveau frontend** : ajouter les fichiers `*.test.ts` / `*.test.tsx` dans le projet Vitest existant (ou équivalent) et garder `make test` qui lance `npm run test` pour ce frontend.

*Ce fichier sert de référence pour savoir quoi tester et quels tests ajouter au fur et à mesure. Mettre à jour les comptes et les cases quand des tests sont ajoutés.*
