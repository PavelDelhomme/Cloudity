# CLOUDITY — Référence des tests

**Objectif** : tout tester (API, frontend, E2E). Les tests unitaires/applicatifs passent par **`make test`**, exécutés **dans les images Docker** (même environnement que la stack). Les E2E sont **à part** : **`make test-e2e`** (après `make up`).

**Règle** : à chaque nouvelle fonctionnalité, ajouter les tests adéquats exécutables par `make test`. Ne pas merger sans tests associés.

**Lien roadmap** : le périmètre fonctionnel des applications et des chantiers transverses (sécurité, infra, gateway) est décrit dans **[ROADMAP.md](./ROADMAP.md)**. Lorsqu’une entrée ROADMAP passe en « livré » ou « MVP », prévoir les tests correspondants ici (Vitest, Go `*_test.go`, pytest, Playwright). **Mobile** : **`make test-mobile-suite`** (Photos → **Drive** → **Mail**) et la **phase 5** de **`make tests`** — détail § **1b** ; cibles **`*-photos|drive|mail`** pour une app seule ; guide **[MOBILES.md](./MOBILES.md)**.

**Suivi quotidien** : **[STATUS.md](../STATUS.md)** · **Backlog condensé** : **[../BACKLOG.md](../BACKLOG.md)**.  
**Stratégie sécurité / confiance** : **[SECURITE.md](./SECURITE.md)** (phases, signatures, Zero Trust, WAF).  
**Autres guides** (éditeur, archi front, sécurité détaillée, notes dev) : **[README.md](./README.md)** (index de ce dossier).

---

## 1. Commandes

| Commande | Rôle |
|----------|------|
| **`make test`** | **Uniquement** tests unitaires + applicatifs (pas d’E2E), **tout dans Docker** : `docker compose run --rm --no-deps <service> go test` pour chaque service Go ; **admin-service** : `exec` si la stack est déjà up (évite un 2e Postgres sur le port hôte), sinon `compose run` avec Postgres ; **admin-dashboard** : `compose run --no-deps` + Vitest. **Prérequis** : démon Docker. **Pas besoin de `make up`** pour les parties Go seules. |
| **`make test-e2e`** | **Tests E2E séparés.** Vérifie que les services répondent (health, gateway proxy, dashboard). **Prérequis : `make up`** puis **attendre 20-30 s** que tous les services soient healthy. |
| **`make tests`** | **TOUT** : unit/app + E2E + **Playwright** + sécurité + **mobile Flutter Photos + Drive + Mail** (`test-mobile-suite`). Rapport dans `reports/`. **Prérequis : `make up`**, **`make seed-admin`**, 20-30 s. |
| **`make test-e2e-playwright`** | **Tests E2E navigateur (Playwright).** Simule un utilisateur réel : login, Hub, Drive, Office. **Prérequis : `make up`**, **`make seed-admin`**, 20-30 s. **Note** : le navigateur et `npx playwright` tournent en général sur la **machine hôte** (pas dans l’image Docker du dashboard) ; le reste de **`make test`** reste **Docker**. |
| **`make test-all`** | Comme **`make tests`** sans fichier de rapport : **`make test`** + **`test-e2e`** + **`test-e2e-playwright`** + **`test-security`** + **`test-mobile-suite`**. |
| **`make test-mobile-suite`** | **Photos** → **Drive** → **Mail** : § **1b**. **`CLOUDITY_SKIP_MOBILE_DRIVE=1`** → sans Drive ; **`CLOUDITY_SKIP_MOBILE_MAIL=1`** → sans Mail. |
| **`make test-mobile-photos`** | Wrapper **`scripts/test-mobile-app.sh` photos** — **`mobile/photos`**. |
| **`make test-mobile-drive`** | Wrapper **`scripts/test-mobile-app.sh` drive** — **`mobile/drive`**. |
| **`make test-mobile-mail`** | Wrapper **`scripts/test-mobile-app.sh` mail** — **`mobile/mail`**. |
| **`make test-security`** | Audits de dépendances (npm audit, safety, govulncheck) + checks auth : `/auth/validate` sans token ou avec token invalide → 401. |
| **`make test-docker`** | Après **`make up`** : **`docker compose exec`** sur les services Go **déjà en cours d’exécution** + pytest / Vitest en **exec** dans admin-* (vérifie le code réellement déployé dans la stack). |

**Pourquoi attendre 20-30 s après `make up` ?** Le **api-gateway** a un `depends_on` avec **condition: service_healthy** sur **auth-service**, **admin-service** et **password-manager**. Docker ne démarre le gateway qu'une fois ces trois services healthy. Comptez ~20-30 s après le démarrage pour que tout soit prêt.

**En résumé** : **`make tests`** ou **`make test-all`** = test + E2E + E2E Playwright + sécurité + **`test-mobile-suite`** (P+D+M). **`make test-full`** = test-all + test-docker. Pour tout lancer : **`make up`**, **`make seed-admin`**, attendre 20-30 s, puis **`make tests`** (avec rapport) ou **`make test-all`**.

**Ce que `make tests` couvre** : (1) **Phase 1** — unitaires/applicatifs ; (2) **Phase 2** — E2E health/proxy ; (3) **Phase 3** — Playwright ; (4) **Phase 4** — sécurité ; (5) **Phase 5** — Flutter **Photos + Drive + Mail** (§ **1b**).

**Résumé en console** : le **RÉSUMÉ** inclut **Mobile (P+D+M)** ; le **RÉSULTAT FINAL** indique SUCCÈS ou ÉCHEC. Avertissements sécurité : détails dans le rapport (`reports/test-*.log`).

**Drive et fichiers « 0 octet » / nettoyage** :  
- **Tests unitaires (Vitest)** : toutes les appels API Drive sont **mockés** ; aucun fichier ni dossier n’est créé en base. Les réponses mockées utilisent `size: 0` pour les nœuds fichier (documents vides à la création), ce qui reflète le comportement réel de l’API.  
- **E2E Playwright** : les scénarios Drive qui créent des dossiers ou téléversent des fichiers **mockent l’API** (route `**/drive/nodes**`) pour ne pas créer de ressources réelles. Le test « Téléverser : file chooser » envoie un fichier vers l’API ; **si l’API est réelle, un fichier peut être créé**. Pour éviter tout fichier résiduel en CI, mocker dans ce test les requêtes POST (création nœud) et PUT (contenu) vers `/drive/nodes` (voir exemples dans les autres tests du fichier).  
- Si vous lancez des E2E contre l’API réelle (sans mocks), des dossiers/fichiers peuvent être créés ; dans ce cas, un nettoyage manuel ou un script post-test peut être nécessaire (non fourni par défaut).

**Drive — Récents / aperçu** : Vitest `DrivePage.test.tsx` (section Récents, ruban racine `fetchDriveRecentFiles` avec limite **24** ; navigation vue Récents). E2E : ajouter plus tard un scénario « vue Récents + grille » si besoin CI.

**Photos** : Vitest `PhotosPage.test.tsx` ; API **`GET /photos/timeline`** — `photos-service/main_test.go` + secours `drive-service` (`GET /drive/photos/timeline`). **Apps Flutter** : **`mobile/photos`**, **`mobile/drive`**, **`mobile/mail`** (`integration_test/*_flow_test.dart`) — **`scripts/test-mobile-suite.sh`** (phase 5 **`make tests`**).

---

## 1b. Mobile Flutter — `make test-mobile-suite` (phase 5 de `make tests`)

**HTTPS (dev vs prod)** : en développement, le gateway est en général joignable en **`http://`** depuis le téléphone (même réseau) — aligné sur **`docker-compose`**. En **production**, le client mobile et le front doivent cibler une **base URL HTTPS** (terminaison TLS sur LB / ingress). Ne pas confondre « tout en HTTPS sur ma machine » (chantier **mkcert** + Vite ou proxy) avec le durcissement **prod** décrit dans **[SECURITE.md](./SECURITE.md)** et **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** § **0c**.

**Orchestrateur** : **`scripts/test-mobile-suite.sh`** → **`test-mobile-app.sh` photos** → **drive** → **mail** (**`scripts/mobile-test-common.inc.sh`**). Cibles **`*-photos|drive|mail`** pour une app seule.

| Étape | Comportement |
|--------|----------------|
| **Flutter absent** | Message d’avertissement ; le script **sort 0** (ne fait pas échouer `make tests` sur une machine sans SDK mobile). |
| **Hôte** | Pour chaque app : `cd mobile/<app> && flutter pub get && flutter test`. **Docker non requis.** Pas besoin de SDK inscriptible pour cette étape. |
| **Saut Drive / Mail** | **`CLOUDITY_SKIP_MOBILE_DRIVE=1`** ou **`CLOUDITY_SKIP_MOBILE_MAIL=1`** pour raccourcir la suite. |
| **ADB** | Si **`adb`** n’est pas installé ou **aucun** périphérique en état **`device`**, la partie **integration_test** est **ignorée** (sortie 0 après les tests hôte). |
| **SDK inscriptible** | **Uniquement** si un **appareil ADB** est prêt pour l’**integration_test** : Gradle doit pouvoir écrire sous `packages/flutter_tools/gradle`. Sinon (ex. **`/usr/lib/flutter`** root sur Arch) : message explicite, **integration_test ignorée**, **sortie 0** — la phase 5 de **`make tests`** reste **OK** dès que les tests **hôte** ont réussi. **`make run-mobile`** continue d’exiger la vérif **avant** le build (voir **`run-mobile.sh`**). |
| **Choix d’appareil** | **`CLOUDITY_DEVICE_ID`** ou **`ANDROID_SERIAL`** si défini ; sinon **un seul** appareil `device` → pris automatiquement ; **plusieurs** appareils + terminal **interactif** → menu **`select`** bash ; plusieurs + **stdin non TTY** (CI) → **premier** serial + avertissement sur stderr. |
| **Sur l’appareil** | `flutter test integration_test/<app>_flow_test.dart -d <serial>` : build APK + scénarios (type E2E Playwright côté natif). |
| **E2E auto** | Si **`CLOUDITY_E2E_GATEWAY`** n’est **pas** défini et **`CLOUDITY_E2E_NO_AUTO≠1`** : **émulateur** détecté (`emulator-*`, `ro.kernel.qemu`, `ro.hardware` ranchu/goldfish) → `http://10.0.2.2:<port>` ; **appareil physique** → `http://<IPv4 LAN du PC>:<port>` via `ip route` puis **`hostname -I`**. Port **`CLOUDITY_GATEWAY_PORT`** (défaut **6080**, comme **`docker-compose.yml`**). Dès qu’un gateway est connu (auto ou export), **`CLOUDITY_E2E_EMAIL` / `PASSWORD` / `TENANT`** prennent les **valeurs démo** (`admin@cloudity.local`, `Admin123!`, `1`) si non fournies. |

**Scénarios `integration_test`**

- **Photos** — smoke + connexion + timeline si dart-defines.
- **Drive** — smoke + connexion + fichiers (`cloudity_drive_files`).
- **Mail** (`mobile/mail/integration_test/mail_flow_test.dart`) — smoke + connexion + boîte (`cloudity_mail_inbox`).

**Variables d’environnement** (lues par le script et transmises en `--dart-define=…`) pour le parcours login **contre la vraie stack** (comme Playwright avec `BASE_URL` + compte démo) :

| Variable | Exemple | Rôle |
|----------|---------|------|
| **`CLOUDITY_E2E_GATEWAY`** | (souvent **inutile** : détection auto) ou `http://192.168.x.x:6080` si tu forces une autre IP | URL **api-gateway** joignable **depuis l’appareil**. |
| **`CLOUDITY_GATEWAY_PORT`** | `6080` | Port hôte du gateway (défaut aligné sur le compose). |
| **`CLOUDITY_E2E_NO_AUTO`** | `1` | Désactive la détection auto du gateway (il faut alors **`CLOUDITY_E2E_GATEWAY`** pour le test login). |
| **`CLOUDITY_E2E_EMAIL`** | `admin@cloudity.local` | Compte (défaut démo après **`make seed-admin`**). |
| **`CLOUDITY_E2E_PASSWORD`** | `Admin123!` | Mot de passe (défaut démo). |
| **`CLOUDITY_E2E_TENANT`** | `1` | Optionnel (défaut **1**). |

Exemple minimal (stack up + seed-admin, téléphone ou émulateur, SDK inscriptible pour build device) :

```bash
make test-mobile-suite
# ou une app : make test-mobile-photos | test-mobile-drive | test-mobile-mail
```

Surcharge manuelle (IP fixe ou port gateway non standard en détection auto) :

```bash
export CLOUDITY_E2E_GATEWAY='http://192.168.1.42:6080'
make test-mobile-suite
```

**Convention** : mêmes idées que Playwright (**`BASE_URL`** + identifiants) ; ici le « navigateur » est l’**APK** sous contrôle du **WidgetTester** + moteur d’intégration Flutter.

**Dépannage** :

1. **« Could not determine java version from '17.x.x' »** — **`gradle-wrapper.properties`** pointant vers une **Gradle trop ancienne** (ex. 2.x). Les apps **`mobile/photos`** et **`mobile/drive`** doivent utiliser **Gradle ≥ 8.13** pour **AGP 8.11**. Ce n’est **pas** un problème d’**ADB** si `adb devices` affiche `device`.

2. **« NoSuchFileException » … `flutter_tools/gradle/.kotlin/sessions/*.salive`** — le SDK Flutter (souvent **`/usr/lib/flutter`** en **root** sur Arch) n’est **pas inscriptible** par Gradle pour les **builds Android**. **`run-mobile.sh`** appelle **`check-flutter-sdk-writable.sh`** avant **`flutter run`**. **`test-mobile-app.sh`** n’applique cette vérif **qu’avant** l’**integration_test** sur appareil : **`flutter test` hôte** peut réussir sans **`chown`**. Pour lancer sur device ou **`make run-mobile`** : **`sudo chown -R $(whoami) /usr/lib/flutter`** (ou Flutter officiel dans **`$HOME`** en premier dans le **`PATH`**). Contournement avancé : **`CLOUDITY_SKIP_FLUTTER_SDK_CHECK=1`** (le build device peut quand même échouer si le SDK reste non inscriptible).

3. **`JAVA_HOME`**, **Android SDK** : vérifier avec **`flutter doctor`**.

4. Sans appareil / sans env Android OK : **`CLOUDITY_SKIP_DEVICE_INTEGRATION=1 make test-mobile-photos`** (phase 5 de **`make tests`** : uniquement `flutter test` hôte).

---

## 2. Ce que `make test` exécute (référence — **Docker**)

Tous les services listés ci‑dessous sont invoqués via **`docker compose run`** (Go avec **`--no-deps`**) depuis la racine du dépôt (`docker-compose.yml`). Les tests **Go** n’ont pas besoin que la stack soit démarrée au préalable.

| Service | Type | Commande | Fichiers | Nombre de tests |
|---------|------|----------|----------|------------------|
| **auth-service** | API (Go) | `go test ./...` (image Docker) | `backend/auth-service/main_test.go` | 15 |
| **api-gateway** | API (Go) | idem | `backend/api-gateway/main_test.go` | 8 |
| **password-manager** | API (Go) | idem | `backend/password-manager/main_test.go` | 3 |
| **mail-directory-service** | API (Go) | idem | `backend/mail-directory-service/main_test.go` | 8 |
| **calendar-service** | API (Go) | idem | `backend/calendar-service/main_test.go` | 2 |
| **notes-service** | API (Go) | idem | `backend/notes-service/main_test.go` | 2 |
| **tasks-service** | API (Go) | idem | `backend/tasks-service/main_test.go` | 2 |
| **photos-service** | API (Go) | idem | `backend/photos-service/main_test.go` | 2 |
| **drive-service** | API (Go) | idem | `backend/drive-service/main_test.go` | 5 |
| **admin-service** | API (Python) | `pytest tests/` | `backend/admin-service/tests/*.py` | 21 |
| **admin-dashboard** | Frontend (Vitest) | `npm run test` | **26+ fichiers** (dont **GlobalSearchPalette.test.tsx**, AppHub, AppLayout, CalendarPage, DocumentEditorPage, DrivePage, **PhotosPage**, MailPage, api, …) | **~207** (+ 3 skippés) — lancer **`make test`** pour le total exact |

**Total** : lancer **`make test`** pour le cumul à jour (tous les services Go, pytest admin-service, Vitest admin-dashboard).

**Exclusion E2E** : les specs Playwright dans `e2e/**` sont exclues de Vitest (`vite.config.js` → `test.exclude: ['e2e/**']`). Les tests E2E **navigateur** se lancent avec **`npm run test:e2e`** dans `frontend/admin-dashboard` ou **`make test-e2e-playwright`** depuis la racine.

**401 en manuel sur /pass/vaults ou /mail/domains (admin)** : en runtime, la gateway a besoin de la clé publique JWT (`public.pem`). Exécuter **`make setup`** puis **`make up-full`** pour que Pass et Domaines admin fonctionnent avec un token valide.

**« [no test files] »** : Lors de **`go test ./...`**, les sous-packages qui n’ont **aucun** fichier `*_test.go` (ex. `.../cmd`) affichent une ligne du type **`?   github.com/pavel/cloudity/api-gateway/cmd   [no test files]`**. C’est **normal** : Go indique simplement qu’il n’y a pas de tests dans ce package. Ces packages ne sont pas comptés dans le nombre de tests ; seuls les packages contenant des `*_test.go` exécutent des tests. Aucune action requise.

**Messages proxy / « no such host » pendant `make test` (api-gateway)** : les tests (`TestAuthPrefixRouted`, etc.) lancent le **handler** gateway dans le **conteneur** `api-gateway` avec **`--no-deps`** : les autres microservices ne sont **pas** démarrés sur le réseau du projet, donc le reverse proxy peut journaliser des erreurs de connexion vers `auth-service`, `mail-directory-service`, etc. Les tests **passent** car ils vérifient surtout l’**absence de 404** sur les préfixes routés. Pour un test **contre la stack réelle**, utiliser **`make test-docker`** après **`make up`** (**`exec`** dans les conteneurs déjà liés).

**`db-migrate` (exit 1) pendant `make test` (admin-service) ou `make test-security` (safety)** : le script **`scripts/migrate-db.sh`** retente la connexion **PostgreSQL** jusqu’à ~30 s (réseau Docker au démarrage). Si l’échec persiste, consulter **`docker compose logs db-migrate`** ou lancer **`docker compose run --rm db-migrate`** pour voir l’erreur SQL exacte (`psql`). En local, vérifier que **`cloudity-postgres`** est **healthy** avant les tests.

**E2E Playwright — éditeur (contenteditable)** : attendre **`data-testid="editor-save-state"`** visible avant de simuler la frappe (chargement terminé, même rendu que pour l’utilisateur). Le HTML chargé depuis l’API est injecté dans la zone d’édition **après** la disparition du spinner.

---

## 3. Détail par couche

### 3.1 API — Backend (Go)

| Fichier | Ce qui est testé |
|---------|-------------------|
| **auth-service/main_test.go** | Health ; hash mot de passe (Argon2id/bcrypt) ; JWT generate/parse ; register ; login succès/échec ; validate token ; refresh ; 2FA enable/verify (**verify avec code invalide → 401**) ; **loadRSAKeys écrit public.pem quand clé générée en dev**. |
| **api-gateway/main_test.go** | Health (GET, method, OPTIONS) ; routage `/auth/*`, `/admin/*`, `/pass/*`, **`/mail/*`**, **`/photos/*`** ; **CORS** (Origin → Access-Control-Allow-Origin). |
| **password-manager/main_test.go** | Health ; `/pass/vaults` sans `X-User-ID` → 401 ; `X-User-ID` invalide → 401. |
| **mail-directory-service/main_test.go** | Health ; `/mail/health` ; `/mail/domains` sans `X-Tenant-ID` → 401 ; `X-Tenant-ID` invalide ; mailboxes/aliases invalid ID ; `/mail/me/accounts` sans `X-Tenant-ID` / `X-User-ID` → 401. |
| **photos-service/main_test.go** | Health ; **GET /photos/timeline sans X-User-ID → 401**. |
| **drive-service/main_test.go** | Health ; GET /drive/nodes sans `X-User-ID` → 401 ; **GET /drive/photos/timeline sans X-User-ID → 401** ; **GET /drive/nodes/recent sans X-User-ID → 401** ; GET /drive/nodes/:id/content sans X-User-ID → 401 ; PUT /drive/nodes/:id/content sans X-User-ID → 401. |

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
| **src/pages/app/ContactsPage.test.tsx** | Titre **Contacts**, bouton Nouveau contact ; état vide « Aucun contact » ; liste de contacts quand l’API en renvoie (mock useAuth + API). |
| **src/pages/app/MailPage.test.tsx** | Titre **Mail** ; état vide « Aucune boîte mail » ; **à l’ouverture d’une boîte** (un compte), **sync IMAP** appelé ; **notification** lorsque le sync renvoie des nouveaux messages (1 ou N) ; **pagination** (`Page X / Y`) ; **multi-sélection** + actions de masse (corbeille, archivage) ; **sélection inversée (page)** ; **menu actions message** (bouton `…` + clic droit) : un seul `role="menu"`, fermeture au second clic sur `…`. |
| **src/pages/app/TasksPage.test.tsx** | Titre **Tâches**, breadcrumb Tableau de bord ; état vide « Aucune tâche » (mock useAuth + API). |
| **src/pages/Dashboard.test.tsx** | Titre ; chargement puis stats (active_tenants, total_users, api_calls_today) ; non authentifié ; erreur. |
| **src/pages/Login.test.tsx** | Formulaire (email, password, tenant) ; appel login + setAuth en succès ; pas d’appel si tenant invalide. |
| **src/pages/Tenants.test.tsx** | Chargement puis liste tenants ; non authentifié ; erreur fetch. |
| **src/pages/Users.test.tsx** | Liste users ; non authentifié ; erreur. |
| **src/pages/Settings.test.tsx** | Rendu Settings ; non authentifié ; erreur. |
| **src/pages/Vaults.test.tsx** | Titre Vaults ; chargement puis liste coffres ; non authentifié ; champ + bouton création. |
| **src/pages/Domaines.test.tsx** | Titre Domaines mail ; chargement puis liste domaines ; non authentifié ; champ + bouton Ajouter. |
| **src/pages/app/DrivePage.test.tsx** | Titre Drive (**`h1` racine en `sr-only`**), breadcrumb, Téléverser, **Nouveau fichier** (menu Document / Tableur / Présentation), Nouveau dossier ; formulaire Nouveau dossier ; **création dossier** (nom + Créer → createDriveFolder) ; **création sous-dossier** (dans un dossier, Nouveau dossier → createDriveFolder avec parent_id) ; état vide ; chaîne avec AppLayout (inputs fichier/dossier, overlay) ; **clic sur nom de fichier éditable (.txt/.md/.html/.csv) ouvre l’éditeur**. Trois tests skippés : menu trois points (Télécharger, Renommer, Corbeille) et modale Corbeille / Renommer — menu rendu en portal (document.body), non affiché en jsdom. **Récents** : bouton Récents, section à la racine (une ligne, toggle, cartes), vue Récents (sous-catégorie, regroupement par jour). **Filtre nom** : query **`?q=`** (dossier courant, client-side) — à couvrir par tests unitaires ciblés si besoin. |
| **src/layouts/AppLayout.test.tsx** | **getAppBreadcrumb** : sur l’éditeur renvoie « Tableau de bord > Drive » (pas Office ni Éditeur) ; sur /app/drive et /app. |
| **src/components/GlobalSearchPalette.test.tsx** | Ouverture modale (loupe), submit → **`/app/drive?q=`**, bouton Contacts → **`/app/contacts?q=`**, Échap, **Ctrl+K**, pas de toggle depuis un input externe. |
| **src/pages/app/DocumentEditorPage.test.tsx** | Identifiant invalide ; fil d'Ariane (Drive, nom, Renommer) ; barre menus ; Renommer/Supprimer ; **modales Lien, Tableau, Quitter (sans enregistrer)** ; Fermer depuis Office/Drive ; helpers. |
| **src/performance.test.tsx** | Rendu DrivePage avec ~80 nœuds ; AppHub ; clic Nouveau dossier réactif ; clic Téléverser. |

**Comportement Mail (actualisation et notifications)** : à chaque ouverture de la boîte mail (ou changement de compte), un **sync IMAP** est lancé puis la liste des messages est rafraîchie ; un **polling** toutes les 60 s refait un sync et affiche une notification en cas de nouveaux messages ; au **retour sur l’onglet** (visibility), un sync est lancé (throttle 30 s) avec notification si nouveaux messages. Les tests unitaires **MailPage.test.tsx** vérifient le sync à l’ouverture et l’appel à la notification.

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
**Voir aussi** : [STATUS.md § 1b](../STATUS.md) (Drive, éditeur, corbeille) pour la roadmap et les tests associés à chaque fonctionnalité. Pour **ZIP (ouverture en live, extraction)** et **éditeur (barre type Office, breadcrumb, boutons en haut)**, voir **§ 4.7** et [STATUS.md § 1c](../STATUS.md).

### 4.0 Drive, éditeur, corbeille (roadmap STATUS.md § 1b)

- [x] **Recherche Drive / globale (MVP)** : palette barre app (**GlobalSearchPalette**), **`?q=`** filtre les noms dans le **dossier Drive courant** ; raccourci **Ctrl/Cmd+K**.
- [x] **Tests Vitest GlobalSearchPalette** : navigation Drive / Contacts, raccourci, Échap (`GlobalSearchPalette.test.tsx`).
- [ ] **Recherche Drive / globale (suite)** : tests **Vitest** parsing **`?q=`** sur **DrivePage** (optionnel) ; **API** recherche arborescente / cross-apps ; **E2E** (saisie palette → liste filtrée puis autres modules).
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

- [x] **scripts/test-security.sh** : exécute **dans Docker** — **npm audit** (conteneur admin-dashboard), **safety** (conteneur admin-service, avec `pip install safety` si besoin), **govulncheck** (conteneurs Go : auth-service, api-gateway, password-manager, mail-directory-service, calendar-service, notes-service, tasks-service, photos-service, drive-service). Aucune installation sur la machine hôte n’est requise.
- [x] **Checks auth** : GET /auth/validate sans token → 401 ; avec token invalide → 401 (si gateway up).
- [ ] Optionnel : rate limiting, headers sécurité (CORS, X-Frame-Options), scan dépendances dans CI.

### 4.6 Sécurité avancée (alignement **[SECURITE.md](./SECURITE.md)**)

À planifier quand les briques existent ; complète §4.5 (dépendances + auth basique).

- [ ] **Signatures applicatives** : tests unitaires / intégration sur **canonical string** + rejet si **nonce** rejoué ou **horodatage** hors fenêtre ; routes pilotes (export, admin critique). *(Les tests **GlobalSearchPalette** couvrent la navigation recherche MVP, pas les signatures.)*
- [ ] **mTLS ou tokens service** : tests ou doc de non-régression pour appels inter-services (gateway → backends).
- [ ] **Audit log** : tests API (écriture + lecture filtrée) quand le schéma est livré.
- [ ] **WAF** : tests infra ou checklist manuelle (mode détection → blocage ciblé) — hors `make test` classique si le WAF n’est pas dans le même compose.
- [ ] **SAST / DAST** : intégration CI (forge) — voir aussi **SECURITE-DONNEES.md**.

### 4.7 À faire (reprise demain) — ZIP et éditeur (STATUS.md § 1c)

À ajouter / adapter quand les fonctionnalités § 1c seront implémentées.

**ZIP — ouverture en live et compression/décompression**

- [ ] **API drive-service** : endpoint list zip entries (ex. GET /drive/nodes/:id/archive/entries) — test unitaire Go (nœud .zip → liste entrées, pas d’extraction).
- [ ] **API drive-service** : endpoint extract (ex. POST /drive/nodes/:id/archive/extract) — test unitaire (extraction → structure dossiers/fichiers).
- [ ] **Frontend** : composant liste contenu ZIP (arborescence) — test unitaire Vitest (rendu, clic sur entrée).
- [ ] **E2E Playwright** : clic sur un fichier .zip dans le Drive → ouverture vue contenu (sans extraction définitive).
- [ ] **E2E Playwright** : upload d’un .zip → option « Extraire ici » → vérifier structure dans le Drive (ou mock API).

**Éditeur — barre type Office, breadcrumb, boutons en haut**

- [ ] **Barre en haut** : Enregistrer et Télécharger à côté de Markdown — test unitaire (DocumentEditorPage) : présence des boutons, clic Enregistrer / Télécharger.
- [ ] **Breadcrumb** : affichage « Tableau de bord > Drive » en haut (pas « Drive > Sans titre.docx ») — unit (getAppBreadcrumb / rendu) ; E2E (vérifier texte breadcrumb dans l’éditeur).
- [ ] **Boutons Fermer et Markdown** en haut quand fichier ouvert — unit (visibilité, Fermer redirige, Markdown bascule affichage) ; E2E (Fermer → retour Drive ; Markdown → mode Markdown).
- [ ] **Couleurs / options édition type Office** : unit (barre de formatage : couleurs, polices, etc.) ; E2E (appliquer couleur → sauvegarder → rouvrir → vérifier).

**Rapport et résumé**

- [ ] S’assurer que **`make tests`** affiche bien le résumé (Unit/App, E2E, E2E Playwright, Sécurité) et le chemin du rapport ; en cas de vulnérabilités, message clair en console.

**Mail — récupération et frontend (STATUS.md § 1c)**

- [ ] **API mail-directory-service** : test (ou scénario manuel) sync IMAP avec un fournisseur type OVH (ssl0.ovh.net) ; message d’erreur clair si identifiants invalides.
- [ ] **Frontend MailPage** : tests unitaires (liste comptes, liste messages, bouton sync, formulaire envoi) ; E2E : ajouter une boîte (mock ou compte test), sync, affichage messages.
- [ ] **Frontend MailPage** : tests unitaires actions de masse complètes (spam, non lu, remettre en boîte) sur sélection multiple.
- [x] **Frontend MailPage** : test **sélection inversée (page)** sur sélection multiple.
- [x] **Frontend MailPage** : test **pagination avec total** (`Page X / Y` + `N message(s)`).
- [ ] **Frontend MailPage** : ajout bouton **“Tout sélectionner (boîte entière)”** (toutes les pages) + actions de masse sur tous les messages de la boîte (pas seulement la page).
- [ ] **Mail dossiers hiérarchiques** : tests API + E2E création dossier/sous-dossier/sous-sous-dossier et déplacement de mails.
- [ ] **Règles automatiques Mail** : tests API (conditions combinées date/heure/expéditeur/destinataire/sujet/contenu) + E2E application immédiate et rétroactive.
- [ ] **Recherche avancée Mail** : tests unitaires filtres combinés + E2E recherche par période, expéditeur, sujet, texte.
- [ ] **Édition compte mail relié** : tests unitaires + E2E (mot de passe modifiable ; **IMAP/SMTP en lecture seule pendant sync** ; re-sync après modification).

---

## 5. Récap

- **Nouvelle fonctionnalité** : la mettre à jour dans **[ROADMAP.md](./ROADMAP.md)** ; ajouter ou cocher les tests listés dans ce fichier (§ 4 « À faire ») pour rester aligné avec le périmètre produit ; les chantiers **sécurité transverse** (phases, signatures, Zero Trust) : **[SECURITE.md](./SECURITE.md)** + **[BACKLOG.md](../BACKLOG.md)**.
- **Lancer tous les tests** : **`make test`** (unit/app uniquement).
- **Lancer tout (unit + E2E + E2E Playwright + sécurité)** : **`make up`**, **`make seed-admin`**, attendre 20-30 s, puis **`make tests`** (rapport dans `reports/`) ou **`make test-all`**.
- **Lancer tout + tests dans les conteneurs** : **`make test-full`** (stack up requise).
- **Lancer les E2E seuls** : `make up` puis `make test-e2e`.
- **Lancer les E2E navigateur (Playwright)** : `make up`, `make seed-admin`, attendre 20-30 s, puis **`make test-e2e-playwright`**.
- **Sécurité** : `make test-security`.
- **Ajouter un test** : créer ou modifier le fichier de test du bon service, puis vérifier que `make test` le prend en compte.
- **Nouveau backend** : ajouter une cible dans le Makefile (ex. `password-manager` déjà présent) et documenter ici.
- **Nouveau frontend** : ajouter les fichiers `*.test.ts` / `*.test.tsx` dans le projet Vitest existant (ou équivalent) et garder `make test` qui lance `npm run test` pour ce frontend.

*Fichier : `docs/TESTS.md` (référence unique des tests ; pas de copie à la racine). Mettre à jour les comptes et les cases quand des tests sont ajoutés.*
