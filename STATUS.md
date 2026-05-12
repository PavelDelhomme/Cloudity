# CLOUDITY — Suivi d'avancement et référence projet

**Dernière mise à jour** : 2026-05-12 — **CI `check-versioning` livré (Phase 0)**. `scripts/ci/check-versioning.sh` couvre les 4 libs partagées (`internalsec`, `pkg/dbpin`, `@cloudity/shared`, `cloudity_shared`). Détecte tout changement de source non accompagné d'un bump CHANGELOG / version (union diff `merge-base...HEAD` + index + working tree). Modes WARNING (défaut) / BLOCKING (`CHECK_VERSIONING_BLOCKING=1`). Cible **`make check-versioning`** + intégration **`make test-security`** (rapport `reports/security-check-versioning.txt`). Doc **[docs/architecture/VERSIONNAGE-LIBS.md § 6](docs/architecture/VERSIONNAGE-LIBS.md)**.

**Dernière mise à jour (2026-05-12)** — **Bloc 4 questionnaire VPS acté (Q21–Q24)**. **Q21=B** (GHCR) et **Q24=A** (GHA matrice) déjà livrés au commit `349d1642` ; **Q22=A** (réseau Docker `web` partagé avec NPM ↔ cookingrecipes) et **Q23=A** (`cloudity.delhomme.ovh` + `api.` / `admin.`) actés comme défaut. Détails + conséquences DNS / Portainer / NPM dans **[docs/decisions/multi-repo/REPONSES.md](docs/decisions/multi-repo/REPONSES.md) bloc 4**. Tests Go non-régression OK (auth-service 2.0 s, api-gateway 22.6 s, internalsec, mail-directory) ; ESLint cloudity-web clean.

**Dernière mise à jour (2026-05-12)** — **E2E Playwright WebAuthn (CDP)**. `e2e/webauthn.spec.ts` + `e2e/fixtures/webauthn-virtual.ts` (`WebAuthn.addVirtualAuthenticator`, ctap2 / internal / resident key). Smoke bouton passkey sur `/login` ; flux admin : mot de passe → `/4dm1n/passkeys` → enregistrement → déconnexion → login passkey. Cible **`make test-e2e-playwright-webauthn`** (prérequis : **`make migrate`** migration **37**, **`make seed-admin`**). Skip si **`GET /health`** sur le dashboard échoue. Doc **TESTS.md**, **WEBAUTHN-PLAN.md** § 7, **BACKLOG**.

**Dernière mise à jour (2026-05-12 nuit octies)** — **WebAuthn Phase W2 frontend livré**. Module `frontend/apps/cloudity-web/src/webauthn.ts` (encodage base64url ↔ ArrayBuffer, helpers `registerPasskey`, `loginWithPasskey`, `listPasskeys`, `deletePasskey`). Page `/4dm1n/passkeys` (liste + ajout + suppression avec confirmation, React Query + toast + lucide). Bouton "Se connecter avec une passkey" sur `LoginPage` (visible uniquement si `isWebAuthnSupported()`). Backend : nouveaux endpoints `GET /auth/webauthn/credentials` + `DELETE /auth/webauthn/credentials/:id` (suppression scoppée user_id). Vitest 246 ✅, build Vite OK, ESLint OK, Go ✅.

**Dernière mise à jour (2026-05-12 nuit septies)** — **mTLS gateway↔auth-service livré (Go + step-ca)**. `auth-service` import `internalsec`, démarre via `http.Server.ListenAndServeTLS` quand `MTLS_MODE != off` (mode `permissive` actuellement). `go.mod` updated avec `replace ../internalsec`. `docker-compose.https.yml` : bind-mount certs `auth-service/{cert,key,ca}.pem` step-ca + séparation CA Postgres (`/run/step/postgres-ca.pem`) / CA Redis (`/run/step/redis-ca.pem`) pour ne pas écraser `/run/step/ca.pem` qui sert maintenant le serveur TLS. `AUTH_SERVICE_URL=https://auth-service:8081` côté gateway. Test unitaire `TestAuthServiceListensInTLSWhenMTLSPermissive` : handshake bout-en-bout via certs ECDSA P256 auto-signés locaux, RoundTripper `internalsec` côté client, status `200 /health`. `make mtls-issue-auth` (auto via `up-https-internal`). Tests Go ✅. Voir **[docs/securite/AUDIT-SECURITE.md](docs/securite/AUDIT-SECURITE.md)** § 6 bis.

**Dernière mise à jour (2026-05-12 nuit sexies)** — **sidecar `cert-renewer` livré (rotation auto certs internes)**. Service Docker dans `docker-compose.security.yml` qui boucle `step ca renew --expires-in 6h` toutes les 10 min sur tous les certs `infrastructure/step-ca/issued/<svc>/`. Démarré automatiquement par `make mtls-up`. Aucun mot de passe CA sur disque (auth via cert+clé existants). Cibles `make cert-renewer-status` / `cert-renewer-restart`. Renew effectif vérifié manuellement (notBefore 17:13 → 19:41 sur api-gateway). Hygiène secrets : balayage `.md` complet → mots de passe de démo retirés de STATUS/BACKLOG/mobile/photos/README ; gitleaks Git history = 0 fuite. Voir **[docs/securite/MTLS-INTERNE.md § 3.4](docs/securite/MTLS-INTERNE.md)**.

**Dernière mise à jour (2026-05-12 nuit quinquies)** — **WebAuthn Phase W1 backend livré (Q17=A)**. Endpoints `/auth/webauthn/{register,login}/{begin,finish}` opérationnels via lib `go-webauthn/webauthn v0.17.3`. Migration `37-webauthn-credentials.sql` (FK `users(id)`, unique global `credential_id`, replay protection via `sign_count` monotone). Challenges en Redis (TTL 5 min, usage unique). Tests unitaires Go ✅ (config + JWT admin gate). Gateway : `/auth/webauthn/login/*` ouvert en public, `register/*` protégé Bearer admin. Variables `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS`.

**Dernière mise à jour (2026-05-12 nuit quater)** — **`Dockerfile.prod` + GHA `docker-publish.yml` livrés (Q24=A)**. Images multi-stage publiées sur **GHCR** à chaque push `main`/`master` ou tag `v*.*.*` :

- 9 services Go → `gcr.io/distroless/static-debian12:nonroot` (build `-trimpath -ldflags="-s -w" -buildvcs=false`).
- `api-gateway` build depuis `backend/` (replace `../internalsec`) avec `Dockerfile.prod` dédié.
- `admin-service` (Python) → `python:3.11-slim`, user `cloudity` uid 1000, `libpq5` only.
- `frontend` (cloudity-web) → image existante (Dockerfile multi-stage Vite + nginx).

Builds locaux validés : `auth-service` (boot Gin OK :8081), `api-gateway`, `passwords-service`, `admin-service`. Workflow YAML linté. Voir **[docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md § 9](docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

**Dernière mise à jour (2026-05-12 nuit ter)** — **mTLS gateway↔admin-service livré (PoC fonctionnel)** : `internalsec.InternalRoundTripper(ConfigFromEnv())` câblé dans `httputil.ReverseProxy.Transport` (api-gateway). `admin-service` (uvicorn) démarre via **`backend/admin-service/start.sh`** qui passe automatiquement en `--ssl-keyfile/--ssl-certfile/--ssl-ca-certs/--ssl-cert-reqs` quand `MTLS_MODE=permissive|strict`. **`make up-https-internal`** émet désormais aussi `api-gateway` + `admin-service` certs via **`make mtls-issue-admin`**. Variables `AUTH_SERVICE_URL`, `ADMIN_SERVICE_URL`, etc. désormais surchargeables (gateway), pour basculer chaque lien séparément. Tests Go gateway/internalsec/auth/mail-directory ✅. Voir **[docs/securite/AUDIT-SECURITE.md](docs/securite/AUDIT-SECURITE.md)** § 6 bis.

**Dernière mise à jour (2026-05-12 nuit bis)** — **HTTPS partout (cible Zero Trust)** : nouvelles cibles **`make up-tls`** (edge Caddy TLS 1.3 + HSTS + CSP par défaut, hybride PQ X25519MLKEM768 quand dispo) et **`make up-https-internal`** (Postgres TLS `sslmode=verify-ca` + Redis `--tls-port` + **auth-service** `REDIS_TLS=1` / go-redis `TLSConfig`). Override **`docker-compose.https.yml`** + **`make mtls-chown-internal-certs`** (bind-mount PEM avec uid postgres **70** / redis **999**). Cibles `mtls-issue-postgres` / `mtls-issue-redis` (TTL **24 h** max provisioner par défaut) + `make https-status`. Variables `MTLS_*` / `REDIS_TLS*` dans `.env.example`. Plan dans **[docs/securite/AUDIT-SECURITE.md](docs/securite/AUDIT-SECURITE.md)** § 6 bis.

**Dernière mise à jour (2026-05-12 nuit)** : **PoC mTLS step-ca livrable** : `make mtls-poc` (`mtls-up` + `seed-mtls` + `mtls-issue NAME=…` + `mtls-verify`) émet un cert client/serveur 24 h avec SAN SPIFFE `spiffe://cloudity.local/ns/default/sa/<svc>` ; chaîne CA bundle (root + intermediate) → `openssl verify` OK ; **test d'intégration Go `TestStepCAIssuedCertsHandshake`** (gated `INTERNALSEC_STEPCA_INTEGRATION=1`) prouve un handshake TLS 1.3 + `RequireServiceCallerHTTP` avec les certs **réels** émis par step-ca. Voir **[docs/securite/MTLS-INTERNE.md](docs/securite/MTLS-INTERNE.md)** § 3.3.b.

**Dernière mise à jour (2026-05-12 soir bis)** — **politique secrets blindée** : nouveau guide **[docs/securite/SECRETS.md](docs/securite/SECRETS.md)** (inventaire, génération, rotation, gitleaks, procédure incident) ; `.gitignore` durci (`.env.*`, `*.pem`, `*.key`, `step-ca/secrets/*`, dumps SQL) ; **`MAIL_PASSWORD_ENCRYPTION_KEY` placeholder hex remplacé par 64 zéros** (anciennement `a1b2c3…67890`, vraie clé AES-256) — `mail-directory-service` refuse de chiffrer/déchiffrer avec la clé zéros (`validateMailEncryptionKeyAtBoot` + tests `TestEncryptPasswordRejectsZeroKey`/`TestIsZeroHexKey`) ; **`gitleaks` intégré à `make test-security`** (157 commits scannés, 0 fuite) — cibles utilitaires `make secrets-scan` / `make secrets-scan-staged`.

**Dernière mise à jour (2026-05-12 soir)** : **mail admin-only Zero Trust** : **double contrôle** gateway (JWT + rôle admin + `Origin`) **et** `mail-directory-service` (`X-Admin-Role: admin` requis) ; gateway **strippe** `X-User-ID`/`X-Tenant-ID`/`X-Admin-Role` à l'entrée (`stripInternalTrustHeaders`). **HTTPS dev** : **`make dev-https`** (mkcert + Vite). **Helper secrets** : **`make secrets`** génère POSTGRES/REDIS/JWT/`PERFORMANCE_INGEST_TOKEN` en 256 bits. Tests Go gateway + mail-directory-service ✅. Bloc Q25–Q31 dans **QUESTIONNAIRE / REPONSES**.

**Dernière mise à jour (2026-05-12 matin)** : durcissement **admin** : UI **`/admin*`** refusée (pas de redirection vers `/4dm1n`) ; gateway **`/admin/*`** exige **JWT admin + `Origin`** ; `POST /admin/performance/pipeline-run` exige **JWT + `X-Cloudity-Perf-Ingest`** (`PERFORMANCE_INGEST_TOKEN` **obligatoire** gateway+admin-service) ; restauration des guides `docs/{architecture,operations,produit,securite}` + audit renommé **`docs/securite/AUDIT-SECURITE.md`**. *(Historique ci-dessous.)*

**Dernière mise à jour (historique)** : 2026-05-05 (convention doc : racine **README** + **STATUS** + **BACKLOG.md** ; ROADMAP / TESTS / MOBILES / PlanImplementation / guides → **`docs/`**). **§0b A1** : workspaces npm racine **`frontend/`** (détail tableau ci-dessous). **Mail** : barre de page allégée (**Nouveau message** seul) ; comptes / Google / paramètres app / synchro dans **« Menu Mail »** à côté du fil d’Ariane (**`AppPageChromeContext`** — réutilisable Calendar, etc.). **Mise à jour mai 2026** : **bridge AppPageChrome** (setters / affichage + **`MailAppChromeMenu`**) ; **`h1` document « Mail »** (`sr-only`, a11y + E2E) ; **Playwright** **`make test-e2e-playwright-mail`** (désormais 8 scénarios, dont navigation Mail ↔ Drive + règles combinées + rétro-application) ; **Vitest / ESLint** dashboard via **Docker** (`make test-dashboard*`). Logs gateway **`JWT … expired`** sur syncs parallèles : bruit connu si rafraîchissement token en cours (voir **TESTS.md** § 4.8). **Suite avril** : suppression en masse corbeille, favicons proxy backend, réconciliation IMAP après règles, anti-rafale sync UI, **polling ~12 s** page Mail / **~18 s** hors Mail, sync après envoi, indicateur sync sidebar. **Migrations** : voir tableau §0 (**`make migrate`**) et **TESTS.md** / **SYNC-BACKLOG §0d**. **Performances** : **[docs/operations/PERFORMANCES.md](docs/operations/PERFORMANCES.md)** + **BACKLOG** n°9 + **ROADMAP TR-06** ; gros exports de trace ignorés par **`.gitignore`**. **Nouveau** : opérateurs de recherche Mail (`from:`, `subject:`, `tag:`) + tests Vitest dédiés ; migration contrôlée **`vite@8` / `vitest@4`** ; remédiation `xlsx` par remplacement de librairies Office (lecture/écriture `.xlsx`) et **audit npm dashboard à 0 vulnérabilité** ; tests mobile : option **`CLOUDITY_KEEP_APP_OPEN=1`** pour relancer et garder l’app ouverte après `integration_test`.  

**Mise à jour 2026-05-06 (en cours)** : Mail web — suppression de boutons en doublon dans la sidebar (actions déjà présentes dans `Menu Mail`), popups `Paramètres Mail`/`Ajouter une boîte` fermables au clic extérieur, compose enrichi (formatage HTML de base), transfert renommé `Transférer le message` avec contenu transféré HTML, programmation d’envoi via modale interne (fin de `window.prompt`) ; gateway — verrouillage admin-only des routes `/mail/domains*`, `/mail/mailboxes*`, `/mail/aliases*` + tests Go dédiés.  
**Mise à jour 2026-05-06 (performance / admin)** : ajout d’un endpoint admin **`/admin/performance/overview`** (snapshot runtime cgroup + docker stats si disponibles) et affichage dans le dashboard admin ; base de traçabilité posée pour la phase suivante (historisation multi-services + métriques de runs tests/E2E/mobile).  
**Branches** : **`main`** = stable ; **`dev`** = intégration ; **`feat/<sujet>`** = chantiers (ex. `feat/photos-gallery-mobile-sync-security` pour Photos galerie + mobile + sync + durcissement sécurité). Détail : **[docs/operations/BRANCHES.md](docs/operations/BRANCHES.md)**.  
**Document de référence** : ce fichier sert de **référence unique** pour l'avancement et les prochaines étapes. *(Fichier canonique : `STATUS.md` à la racine du repo.)*

**Emplacement des docs** : à la racine, **`README.md`**, **`STATUS.md`** et **`BACKLOG.md`** (priorités et cases à cocher condensées) ; **ROADMAP**, **TESTS**, **MOBILES**, **PlanImplementation**, **MAIL-GMAIL-OAUTH** et les guides → dossier **`docs/`** (index **[docs/README.md](./docs/README.md)**).

**Backlog condensé (démarrage / priorités)** : **[BACKLOG.md](./BACKLOG.md)** — point d’entrée avant le détail **SYNC-BACKLOG** / **ROADMAP**.

**Catalogue produit & mobile** : **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)** — applications et **transversal** (sécurité, infra, API, monorepo) ; **[docs/produit/VISION-SUITE.md](docs/produit/VISION-SUITE.md)** — ordre suite & décisions (P0–P7) + **état réel** vs roadmap externe. **[docs/produit/MOBILES.md](docs/produit/MOBILES.md)** — matrice **web / mobile** + **admin mobile** (ADM-02) + **§0** (règle **web avant mobile** pour chaque app, puis Flutter / `make run-mobile`). **Sync Mail/Drive/Calendar, archivage mail serveur, session longue, `make run-mobile`** : **[docs/produit/SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)**. **Performances & diagnostic** (stack actuelle, leviers d’optimisation, alternatives, sans sacrifier **SECURITE** ni l’UX) : **[docs/operations/PERFORMANCES.md](docs/operations/PERFORMANCES.md)** ; exports **React Profiler** / **Chrome Performance** (`profiling-data*.json`, `Trace-*.json` / `.tgz`) : **ne pas versionner** (voir **PERFORMANCES §8** et `.gitignore`).

**Sécurité & confiance (vision suite Google + niveau Proton, phases, signatures requêtes, Zero Trust, WAF)** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** — complète **[docs/securite/SECURITE-DONNEES.md](docs/securite/SECURITE-DONNEES.md)** (chiffrement, durcissement HTTP, TR-01).

**Pourquoi mocker l'API dans les tests ?** Les tests unitaires / applicatifs (Vitest) **mockent l'API** pour être rapides, reproductibles et sans dépendance à la stack (Docker, gateway, DB). On vérifie ainsi le comportement du front (rendu, clics, appels API avec bons paramètres) sans lancer les vrais services. L'objectif est la pratique standard (tests isolés). L'avancement **réel** du projet se fait en **ajoutant des fonctionnalités** (Drive, éditeur, corbeille) **et** les tests associés. Voir section **« Drive, éditeur, corbeille »** (§ 1b) pour les prochaines évolutions concrètes. **Tests** : **Docker d’abord** pour Vitest / ESLint (**`make test`**, **`make test-dashboard`**, **`make test-dashboard-one FILE=…`**, **`make test-dashboard-lint`**) — pas d’obligation d’installer Node sur l’hôte pour la barrière de merge ; **Playwright** pilote le navigateur sur l’**hôte** contre la stack **`make up`** (**`make test-e2e-playwright`**, **`make test-e2e-playwright-mail`** pour Mail / § **4.8**). Détail : **[docs/operations/TESTS.md](docs/operations/TESTS.md)** § **1**.

---

## 0. Démarrage

**Ordre lecture** : **[BACKLOG.md](./BACKLOG.md)** (priorités + liens) → **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** (cadre confiance / phases) → ce §0 pour les commandes → **[docs/operations/TESTS.md](docs/operations/TESTS.md)** avant merge.

| Action | Commande |
|--------|----------|
| **Démarrer la stack** | `make up` |
| **Arrêter la stack** | `make down` |
| **Logs en temps réel** | `make logs` |
| **Aide Make** | `make help` |
| **Première fois** | **`make setup`** puis **`make up-full`** |
| **Migrations SQL** | **`make migrate`** (racine, Docker) — applique **`infrastructure/postgresql/migrations/`**. Inclus aussi dans **`make rebuild`** / chaîne **`make up`** via le service **`db-migrate`**. Détail **[docs/operations/TESTS.md](docs/operations/TESTS.md)** (Migrations). |
| **App mobile (Flutter)** | **`make run-mobile APP=Admin`**, **`APP=Photos`**, **`APP=Drive`**, **`APP=Mail`** (prérequis : Flutter) — détail **[docs/produit/MOBILES.md](docs/produit/MOBILES.md)** § 5 |

**URLs (dev, HTTP)** : App principale http://localhost:6001 | **Back-office** http://localhost:6001/4dm1n (le chemin UI **`/admin`** est **volontairement absent** : pas de redirection ni d’alias vers `/4dm1n` — anti-énumération ; les API restent **`/admin/*`** sur la gateway) | API http://localhost:6080 | Adminer http://localhost:6083 | Redis Commander http://localhost:6084 — **HTTPS en production** (terminaison TLS sur LB / ingress) : voir **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** et **§ TLS & scans** ci-dessous. **HTTPS dev local optionnel** : **`make dev-https`** (mkcert + Vite, https://localhost:5173 — `scripts/dev/dev-https.sh`).

**Redis (logs « Memory overcommit must be enabled »)** : paramètre **hôte** `vm.overcommit_memory=1` — **[docs/operations/DEVELOPMENT-HOST.md](docs/operations/DEVELOPMENT-HOST.md)** ; **`make host-redis-sysctl`** puis éventuellement **`make host-redis-sysctl APPLY=1`**.

**Session web** : JWT d’accès **60 min** par défaut (`ACCESS_TOKEN_DURATION_MINUTES` sur **auth-service** dans `docker-compose`) ; refresh **30 j** avec rotation ; le front **rafraîchit** le token toutes les **10 min** et **au retour sur l’onglet** pour éviter les déconnexions quand le navigateur ralentit les timers en arrière-plan.

**Ouvrir sur smartphone** : CORS autorise le réseau local (`CORS_ALLOW_LAN=true` par défaut en dev). Sur ta machine, définis `VITE_API_URL=http://<TON_IP>:6080` (ex. `192.168.1.5`) dans `.env` ou au lancement, puis `make up`. Sur le téléphone (même Wi‑Fi), ouvre `http://<TON_IP>:6001`.

**Connexion locale** : Il n'y a pas de compte par défaut. Soit créer un compte sur http://localhost:6001/register , soit lancer **`make up-full`** (après **`make setup`**) pour créer le compte de démo `admin@cloudity.local` (tenant 1). Le mot de passe de démo est défini dans `scripts/db/` / `Makefile` (cible `seed-admin`) — **ne jamais le réutiliser hors du dev local** ; voir **[docs/securite/SECRETS.md](docs/securite/SECRETS.md)**. **`make up-full`** = down + up + attente services + seed + seed-admin + **make test** (une seule commande, vérification incluse).

> **Accès au back-office `/4dm1n`** : il faut un **JWT avec `role: "admin"`**. **`make seed-admin`** **crée** le compte de démo **et le promeut** (`UPDATE users SET role='admin'`). Côté **auth-service**, les JWT incluent désormais le claim `role` (lu en BDD au login / register / refresh). Si tu étais connecté **avant** ce changement (token sans `role`), **déconnecte-toi puis reconnecte-toi** : sinon l’UI redirige vers `/app` et l’API gateway renvoie **403 admin role required**.

**Authentification et interconnexion centralisées** : Oui. **Un seul** service d’auth (**auth-service**), **une seule** entrée API (**api-gateway** sur le port 6080). Toutes les apps (Dashboard, Drive, Mail, Pass, Agenda, Notes, Tâches) utilisent le **même JWT** : le frontend stocke le token dans le localStorage (`cloudity_admin_auth`) et envoie `Authorization: Bearer <token>` sur chaque requête. Le gateway valide le JWT, extrait `user_id` et `tenant_id`, et les transmet aux backends via les en-têtes **X-User-ID** et **X-Tenant-ID**. Aucun backend ne fait de login lui-même : Pass, Mail, Drive, Calendar, Notes, Tasks et Admin s’appuient tous sur ce mécanisme. Les futures apps (Flutter, PWA) pourront réutiliser la même API et le même token.

**Évolution en cours** : structurer le front en **plusieurs produits** (même repo, URLs / builds séparés, packages partagés, admin isolé) — détail et checklist complète en **§ 0b** (après les commandes de test ci-dessous).

### Tests (à suivre absolument)

| Commande | Rôle |
|----------|------|
| **`make test`** | Tests unitaires + applicatifs **dans Docker** (`compose run` / `exec`). **Ne lance pas les E2E.** Docker requis ; voir **TESTS.md**. |
| **`make test-e2e`** | **Tests E2E à part** : vérifie que les services répondent (health, gateway proxy). **Prérequis : `make up`** avant, puis **attendre 20-30 s** que tous les services soient healthy. |
| **`make tests`** | **Batterie complète** avec rapport dans `reports/` : **`make test`** + **`test-e2e`** + **`test-e2e-playwright`** + **`test-security`** + **`test-mobile-suite`** (Flutter **Photos + Drive + Mail** : hôte + `integration_test` sur ADB si SDK inscriptible). Prérequis : stack + **`make seed-admin`** pour les phases web ; voir **[docs/operations/TESTS.md](docs/operations/TESTS.md)** § 1b. |
| **`make test-all`** | Même enchaînement que **`make tests`** sans fichier de rapport : **`make test`**, **`test-e2e`**, **`test-e2e-playwright`**, **`test-security`**, **`test-mobile-suite`**. |
| **`make test-mobile-suite`** | **Photos** → **Drive** → **Mail** (`scripts/mobile/test-mobile-suite.sh`). Variables **`CLOUDITY_SKIP_MOBILE_DRIVE`** / **`CLOUDITY_SKIP_MOBILE_MAIL`** pour sauter une app. |
| **`make test-mobile-photos`** | Uniquement **`mobile/photos`** : `flutter test` (hôte) + **`integration_test`** sur un appareil **ADB** si disponible (menu de choix si plusieurs). |
| **`make test-security`** | Audits de dépendances (npm, pip safety, govulncheck) + checks auth (401 sans token / token invalide sur `/auth/validate`). |
| **`make test-docker`** | **`exec`** dans la stack **déjà démarrée** (`make up`) — vérifie les binaires en cours d’exécution. |
| **`make test-full`** | test-all + test-docker (tout, stack up requise). |
| **`make test-auth`** | Smoke **auth-service** seul : `go test` dans Docker (`compose run --no-deps`), sans enchaîner toute la suite **`make test`**. |
| **`make test-go-one SERVICE=nom`** | Idem pour **un** service Go (`api-gateway`, `mail-directory-service`, `drive-service`, …) — **`SERVICE`** = nom du service dans **docker-compose.yml**. |

**Important** : Pour **tout** vérifier (unit/app + E2E web + Playwright + sécurité + **mobile P+D+M**) : **`make up`**, **`make seed-admin`**, attendre 20-30 s, puis **`make tests`** (rapport) ou **`make test-all`**. Pour inclure aussi les tests dans les conteneurs : **`make test-full`**.  
**Pourquoi attendre ?** Le **gateway** ne démarre qu'une fois **auth-service**, **admin-service** et **passwords-service** déclarés **healthy** par Docker (depends_on + healthcheck). Après un `make up`, Postgres/Redis puis les backends passent healthy en ~20-30 s, ensuite le gateway et le dashboard.

**Ce que `make test` exécute (résumé)** : services Go en **`docker compose run --rm --no-deps … go test`** ; **admin-service** en **`exec`** si conteneur déjà up (sinon `compose run` avec Postgres) ; **cloudity-web** Vitest en **`compose run --no-deps`**. Détail et comptes : **[docs/operations/TESTS.md](docs/operations/TESTS.md)**. Checklist post-modif : **[docs/operations/DEV-VERIFICATION.md](docs/operations/DEV-VERIFICATION.md)**.

**Règle** : pour chaque fonctionnalité implémentée, ajouter des tests exécutables via `make test`. Ne pas merger une feature sans tests associés.

**État des tests** : lancer **`make test`** (Docker) avant merge ; smokes rapides **`make test-auth`** ou **`make test-go-one SERVICE=…`** ; **CI** : **`.github/workflows/docker-unit-tests.yml`** rejoue **`make test`** sur push / PR (`main`, `master`). Chiffres et détail : **TESTS.md**. E2E Playwright : `make up` + `make seed-admin` puis **`make test-e2e-playwright`**. **Mobile (Photos, Drive, Mail)** : **`make test-mobile-suite`** (phase 5 de **`make tests`**) ou **`make test-mobile-mail`** / **`make test-mobile-drive`** / **`make test-mobile-photos`** — ADB + variables **`CLOUDITY_E2E_*`** pour un parcours login réel sur appareil ; si le message **« SDK Flutter non inscriptible »** apparaît, les **`integration_test`** device sont ignorées alors que **`flutter test`** (hôte) reste **OK** : corriger les droits sur le SDK (ex. `sudo chown -R "$(whoami)" /usr/lib/flutter` ou installer Flutter dans **`$HOME`**), voir **TESTS.md** § 1b. Pour rejouer les tests **dans les conteneurs déjà démarrés** : **`make test-docker`**.

**Ordre produit (boussole)** : voir **`docs/produit/VISION-SUITE.md`** — suite type Workspace : fondation transverse (**[PERFORMANCES.md](docs/operations/PERFORMANCES.md)**, **SECURITE**, recherche) puis **Mail → Alias → Pass → Photos → Drive → Contacts/Calendar profonds → Office** ; **Photos** reste un produit **distinct** de Drive (pipeline + UX dédiés). **Exécution dépôt (parallèle réel)** : **Mail** est très avancé (règles, FTS, sync UI, batch…) ; **Photos** (timeline, web, mobile, albums partiels) et **Drive** (recherche, tableau) progressent en parallèle ; **Pass** MVP ; chantiers listés § 1b et **`docs/operations/TODO.md`**. La règle **web puis mobile** par produit reste dans **`docs/produit/MOBILES.md`** § 0.

**Prochaine étape (en cours)** :  
1. **Administration opérationnelle (priorité immédiate)** — outillage de nettoyage des tenants de test + pagination des écrans Admin (`Tenants`, `Users`, puis Domaines / autres listes) pour rendre l’exploitation plus fiable avant d’élargir la suite.  
2. **Architecture multi-produits (§ 0b)** — **A1 phase 1** (workspaces npm racine **`frontend/`**) livré ; enchaîner **A2 + A3 minimal** (auth + client API partagés) puis **A8** (Docker build depuis **`frontend/`** unifié) selon besoin.  
3. **Trajectoire livraison produit (après stabilisation admin + web)** — finaliser le socle **Mail / Photos / Contacts / Calendar / Drive** en **Web** puis dupliquer en **Linux/Desktop** et **Mobile** (même compte Cloudity / même API gateway locale), pour usage quotidien réel et déploiement VPS.

**Note cadrage produit (mai 2026)** : après stabilisation Web Mail, la suite planifiée est la parité fonctionnelle Desktop/Linux + Mobile (connexion compte Cloudity existant, ex. `admin@cloudity.local` en environnement local), testable sur réseau local domestique avant bascule VPS. Prévoir et maintenir en parallèle : pipeline **CI/CD**, sauvegardes automatiques et **snapshots** de restauration (DB + stockage) pour rollback rapide en cas d’incident.

**Plus tard (tâches à faire)** : Administration (renforcer écrans, rôles) ; **Photos** — albums, sync batterie, détection des **autres apps** suite sur l’appareil (phase 2) ; l’app **mobile/photos** a désormais **connexion compte**, timeline et tests **`make test-mobile-photos`** (voir `docs/produit/PHOTOS.md`, **TESTS.md** § 1b) ; **Notes** (interface type Google Keep, cartes, couleurs, rappels) ; **Calendar** (vue agenda / semaine améliorée) ; Mail client riche (suite prioritaire après stabilisation Photos) ; Contacts ; etc. Voir section 1 et 5 ci-dessous.

**Suite utilisateur (UX récente)** : barre d’app **recherche** (icône loupe + **Ctrl/Cmd+K**) à côté des **notifications** ; sur **Drive**, **`?q=`** avec terme non vide déclenche la recherche **API** sur **tout l’arborescence** (**`GET /drive/nodes/search`** via la gateway) ; sans terme (ou hors ce flux), la liste du **dossier courant** reste la référence (filtre client possible). Recherche **cross-apps** (Mail, Pass…) : backlog **BACKLOG.md** / **TESTS.md** §4.0. **Mail (web)** : notifications nouveaux messages actives même hors page `/app/mail` via watcher global dans `AppLayout` (sync périodique + retour d’onglet). **Mobile Mail** : sync in-app périodique + bannière nouveaux messages (pas encore push système FCM/APNs/Linux). **Navigation SPA (hub → Photos, etc.)** : **`AppLayout`** remonte l’**`<Outlet key={pathname} />`** pour que chaque changement de route réinitialise proprement la page cible sans rechargement complet ; **Photos** utilise **`isPending`** (TanStack Query v5) pour l’état chargement / vide de la chronologie. **Photos (web)** : navigation principale en **barre fixe en bas** via **`PhotosBottomNav`** (palette **Material / Google**, fond sombre `#1f1f1f`, onglet actif surligné) ; **chronologie** : titres de jour **grands / légers** + **sous-texte** ; bandeau sticky **aligné sur le shell** (`slate-900` / `gray-50`, plus de bandeau noir isolé) ; **Sélectionner** à côté de **Actualiser / Importer** ; **Albums** : cartes + vue dossier ; **Corbeille** : grille photos corbeille + **Restaurer** + lien Drive. **Reste à livrer (Photos web)** : **création** d’album + métadonnées ; **corbeille** et **archivé** dédiés app Photos ; **coffre / verrouillé** — **docs/operations/TODO.md** § « Photos web — suite produit ».

**Stratégie sécurité / produit** : document **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** — cible *expérience type Google* + *promesses type Proton* (E2EE / zero-access sur espaces privés), **4 couches** (sync, fichiers, photos, sécurité), **phases 1–4**, **signatures HTTP** complémentaires au TLS, **Zero Trust**, rôle **WAF** en périmètre. Mettre à jour **BACKLOG.md** (§ sécurité) quand une ligne est livrée.

### TLS & scans (réponse courte)

| Sujet | Réponse |
|--------|---------|
| **`http://localhost:6001/app` en dev** | Normal : la stack Docker sert le dashboard en **HTTP** sur la machine hôte. **« Sécurité de zinzin »** en prod = **TLS** (LB / ingress), **HSTS**, cookies **Secure**, politique CSP, pas de mix **HTTP**/**HTTPS**. Passer **tout** le dev local en **https://** = chantier dédié (certificats **mkcert** + **Vite `server.https`** ou reverse proxy type **Caddy**) — backlog **[docs/produit/SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)** § **0c**. |
| **Détecter les failles dans le dépôt** | Déjà : **`make test-security`** (npm audit, safety sur admin-service, **govulncheck** sur chaque service Go), checks **401** sur `/auth/validate`. Rapports : `reports/security-*.txt`, `reports/govulncheck-*.txt`. Remédiation : monter **pytest** ≥ 9.0.3 (CVE-2025-71176), traiter les **npm audit** high sur le frontend (**service cloudity-web**), suivre les sorties govulncheck. |
| **OpenClaw / ClawSecure** | Outils **tiers** pour auditer des *skills* / agents **IA** (OWASP ASI), ex. [ClawSecure OpenClaw](https://github.com/ClawSecure/clawsecure-openclaw-security) — **pas** un remplacement du durcissement applicatif Cloudity ; utile si vous versionnez des *Cursor skills* sensibles **à part**. |

**État (2026-02)** : **Migrations DB** au `make up`. **Drive** : opérationnel. **Éditeur document** : **fil d'Ariane** (Drive > nom), **renommer** (bouton à côté du titre), **barre de menus** (Fichier, Édition, Affichage, Insertion, Format), **barre de formatage** (gras, titres, listes, tableau, lien, citation), mode Markdown, sauvegarde .docx/.xlsx ; **drawer** sidebar (nav gauche masquable, `cloudity_sidebar_visible`). Objectif : éditeur maison complet (Word/Excel/PowerPoint niveau Google Docs et au-delà). **JWT** : clés RSA persistées (private.pem + public.pem) pour éviter l'invalidation des tokens au redémarrage. **API** : le dashboard en Docker utilise `VITE_API_URL=http://localhost:6080` (port 6080 car Chrome bloque 6000 — ERR_UNSAFE_PORT). En cas de 401, vérifier que vous êtes bien connecté ou faire **make setup** puis **make up**.

---

## 0b. Architecture multi-produits (EN COURS — avril 2026)

**But** : garder **un seul dépôt** Cloudity tout en préparant **plusieurs applications front** (chacune son entrée Vite ou son domaine), des **bibliothèques communes** réutilisables, la **même couche compte** (JWT, gateway), et un **back-office administrateur clairement séparé** des apps **utilisateur** (suite type Google). Côté backend, on **conserve** le principe actuel : **un service par domaine** (mail-directory, drive-service, etc.) derrière la **même gateway** ; cette initiative concerne surtout l’**organisation du frontend** et le **découpage des déploiements**, sans tout fusionner dans une seule SPA « fourre-tout ».

**Principes** :
- **Suite utilisateur** : hub, Mail, Drive, Pass, Agenda, etc. — une ou plusieurs apps front selon le découpage (lazy routes d’abord, builds séparés ensuite si besoin).
- **Admin** : écrans Tenants, Users, Domaines, stats — **app ou base URL dédiée**, pas mélangée aux parcours `/app/*` grand public.
- **Partagé** : auth (token, contexte ou hooks), client HTTP + types API, design system / composants si utile — **une seule source de vérité** par concern.

### Checklist globale (tout ce qu’il faut pour arriver à la cible)

Cocher au fur et à mesure ; l’ordre recommandé est indicatif (migration **progressive**, sans big-bang).

| ID | Tâche | Détail / livrable | Statut |
|----|--------|-------------------|--------|
| **A0** | **Documentation & alignement** | Ce fichier (§ 0b), noms des apps/packages figés en équipe | 🟡 En cours |
| **A1** | **Workspaces frontend** | **À jour** : racine **`frontend/package.json`**, workspaces **`apps/*`** + **`packages/*`** (**`@cloudity/web`**, **`@cloudity/shared`**). Docker : service **`cloudity-web`**, contexte **`./frontend`**, lockfile racine. | 🟢 |
| **A2** | **Package auth partagé** | Clé **`AUTH_STORAGE_KEY`** dans **`cloudityCore.ts`** (auth aligné) ; suite : helpers **`Authorization`** / **`X-Tenant-ID`** extraits des appels **`fetch`** | 🟡 Minimal |
| **A3** | **Package client API partagé** | **`packages/cloudity-shared`** (`cloudityCore.ts`, `jwtRole.ts`, …) — consommé par **`@cloudity/web`** ; suite : **`getAuthHeaders`**, types API, réduction des imports directs depuis l’app | 🟡 Minimal |
| **A3.1** | **Mail IMAP ↔ BDD & dossiers** | Sync IMAP reste source des en-têtes ; **`mail_messages`** = cache/query côté Cloudity. **À faire** : création **sous-dossiers** sous INBOX (IMAP `CREATE` + ligne **`mail_imap_folders`**), déplacement message = **IMAP COPY/APPEND + expunge** + **UPDATE** BDD ; vue **`folder=all`** exclut **trash/spam/drafts** (API + badge UI) ; barre latérale sans doublon **Trash** vs **Corbeille** (filtre `imap_special_use` + chemins réservés). Livré partiellement : filtre **`folder=all`**, UI dossiers / libellés. | 🟡 Partiel |
| **A3.2** | **Règles de tri Mail (type Proton)** | **Livré partiellement** : assistant **« créer une règle à partir de ce message »** (⋯ liste + détail), **édition + activer/désactiver** des règles, critères **from / domaine / destinataire / sujet / PJ / étiquette**, actions dossier standard **ou dossier IMAP personnalisé** + marquer lu + **ajout d’étiquette**, **appliquer aux existants** ; recherche liste **FTS** (FR+EN, HTML léger, **`sort=date`** ou **`sort=rank`** (défaut)); stockage **JSON** (`criteria_json`, `actions_json`) + **ordre d’exécution** (`rule_order`) livré ; **réconciliation IMAP** à l’application des règles (move + `\\Seen`, best-effort) livrée. Voir **SYNC-BACKLOG** §0b. | 🟡 Partiel |
| **A4** | **Package UI optionnel** | Composants réutilisables (boutons, layout partiel) si duplication constatée entre apps | ⬜ |
| **A5** | **App suite utilisateur** | Projet Vite dédié : hub + produits ; **aucune** route admin métier ; consomme A2/A3 | ⬜ |
| **A6** | **App admin-console** | Projet Vite dédié : login (même JWT), Tenants, Users, Domaines, Settings admin uniquement | ⬜ |
| **A7** | **URLs & ports dev** | Ex. `localhost:6001` = suite, `localhost:6002` = admin — ou sous-domaines locaux (`app.cloudity.test` / `admin.cloudity.test`) + proxy | ⬜ |
| **A8** | **Docker / Make** | **Partiel** : service **`cloudity-web`**, contexte **`./frontend`**, **`npm install`** au run + Vitest/Playwright côté Makefile ; reste : apps séparées (ports / images distincts) si scission **A5/A6** | 🟡 |
| **A9** | **CORS gateway** | Liste d’origines autorisées incluant **toutes** les URLs des apps front (dev + prod) | ⬜ |
| **A10** | **CI / `make test`** | Vitest **`cloudity-web`** dans Docker ; E2E Playwright sur hôte — **OK** ; à suivre si multi-apps | 🟡 |
| **A11** | **Migration du code existant** | Dossier historique **`admin-dashboard`** → **`apps/cloudity-web`** (**fait**) ; suite : extraire pages par blocs vers futures **`apps/*`** sans casser les routes | 🟡 |
| **A12** | **Playwright** | Projects ou profils séparés (suite utilisateur vs admin) si deux apps | ⬜ |
| **A13** | **Prod / reverse proxy** | Nginx ou Traefik : `app.*` vs `admin.*` (ou chemins distincts) vers les bons conteneurs | ⬜ |

**Hotfix Mail (LIST IMAP, avril 2026)** — hors grille A1 : l’upsert `mail_imap_folders` passait **`NULLIF($6,'')`** en valeur d’insert alors que **`imap_special_use`** est **NOT NULL** (migration 23) → erreurs Postgres à chaque sync pour les dossiers sans rôle IMAP. Correction : **`VALUES (…, COALESCE(NULLIF($6,''), ''))`** ; heuristique **`envoyé`** sur chemin / libellé pour **OVH** type **`INBOX.Envoyés`** → rôle **sent**. Fichier : **`backend/mail-directory-service/imap_folders.go`**. **Déploiement** : si **`make logs`** montre encore `VALUES (…, NULLIF($6, ''))` dans le **STATEMENT** Postgres, ce n’est pas un nouveau bug : le processus **mail-directory-service** en cours d’exécution est encore l’ancien (souvent **`go run`** dans **Dockerfile.dev** + volume : le code disque est à jour mais le processus n’a pas été relancé). **`docker compose restart mail-directory-service`** suffit en général ; sinon **`make rebuild`**. Après redémarrage, la requête dans les logs Postgres doit afficher **`COALESCE(NULLIF($6, ''), '')`**. **Bruit logs sync** : les lignes **`[mail] sync select "Archive"…`** n’étaient pas des bugs applicatifs (probes) ; elles sont **filtrées** côté **`mail-directory-service`** ; **`[Gmail]/Archive`** est tenté **en dernier** ; **`http: proxy error: context canceled`** côté gateway est **silencieux** si le client coupe la requête — **`api-gateway/main.go`**. Détail lecture logs : **SYNC-BACKLOG §0b**.

### Étape technique immédiate (après A0)

1. ~~**A1**~~ — Workspaces **`frontend/`** + app **`@cloudity/web`**. ~~**A11** (renommage dossier)~~ — **`apps/cloudity-web`**.  
2. **A2 + A3 (minimal)** — Poursuivre depuis **`@cloudity/shared`** : helpers **`Authorization`** / **`getAuthHeaders`**, types partagés ; **A3.1** / **A3.2** (Mail IMAP + règles) selon **SYNC-BACKLOG**.  
3. **A8** — Finaliser la **scission déploiement** (images ou ports distincts **suite** vs **admin**) seulement si besoin produit ; sinon rester sur **`cloudity-web`** unifié.  
4. **Produit (STATUS § « Prochaine étape »)** : admin (pagination listes, outil tenants de test) → stabilisation web Mail/Photos → mobile/desktop.

**Rappel** : les backends et routes gateway (`/mail/*`, `/drive/*`, …) **restent** tels quels au début ; on ajoute surtout de la **structure front** et du **partage de code**.

**Périmètre fonctionnel des apps** (Mail domaines perso, transferts, alias, Drive, Office, mobile, etc.) : **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)** ; **mobile** : **[docs/produit/MOBILES.md](docs/produit/MOBILES.md)**.

---

## 1. Ce que je dois faire (priorités)

Section pour **avancer concrètement** : cocher au fur et à mesure. **Backlog condensé** : **[BACKLOG.md](./BACKLOG.md)**. **Tests à prévoir** : **[docs/operations/TESTS.md](docs/operations/TESTS.md)** §4.

### Pistes « à faire » les plus rentables (ordre court)

| Priorité | Action | Référence |
|----------|--------|-----------|
| 1 | Stabiliser **Photos** (mobile auth, albums, sync batterie — MVP déjà web + API) | **docs/produit/PHOTOS.md**, **SYNC-BACKLOG** |
| 2 | Poursuivre **Mail** (dossiers IMAP §0b, recherche §9, PJ, archivage) | **SYNC-BACKLOG**, **STATUS** §1c M* |
| 3 | **Éditeur** : export PDF, tableur / .pptx, barre Office §1c E* | **editeur-docs.md**, **TESTS** §4.7 |
| 4 | **Drive** : ZIP live + extract (Z1–Z3), PDF.js aperçu | **TESTS** §4.7 |
| 5 | **Recherche** : API arborescente / cross-apps (au-delà du MVP `?q=` + palette) | **BACKLOG**, **TESTS** §4.0 |
| 6 | **Sécurité** : suivre phases **docs/securite/SECURITE.md** + durcissement **SECURITE-DONNEES.md** | **SECURITE.md** |

### Extensions applicatives (vision elargie, sans doublons coeur)

Etat: **cadre ajuste**. Priorite reaffirmee:
1) Drive/Mail/Photos/Pass, 2) Calendar/Notes/Tasks/Contacts, 3) catalogue additionnel.

| Vague | Cibles |
|------|--------|
| **Vague A (quand coeur stabilise)** | Dashboard/Home, Search globale, Notifications/Activity/Trash/Share center, Bookmarks/Read later, Wiki, Kanban, Forms, Sites/Pages, Journal, Habits, Snippets/Templates, RSS/Scanner, Receipts/Documents perso |
| **Vague B (apres A)** | PKM/Graph, Whiteboard/Canvas, PDF annotation, Reference manager, Web clipper backend, Clipboard sync, Secure drop, Guest portal, Workflow automation, Universal search, Developer hub, Backup/Device center |
| **Vague C (long terme)** | Chat/Team messaging, Meet/Calls, Security/Admin center avance, marketplace integrations, CRM/client portal, no-code DB, home automation, e-signature, assistant IA transversal |

### Immédiat (base actuelle)

- [x] **Vérifier la stack** : `make up` puis ouvrir http://localhost:6001 et http://localhost:6080/health ; Redis healthy, tous les services démarrent. (Correction Redis : mot de passe passé via shell pour que la variable d'env soit bien utilisée.)
- [x] **Consolider l'auth** : Argon2id pour les mots de passe, refresh tokens avec rotation, 2FA TOTP opérationnel (auth-service). Tests associés (main_test.go).
- [x] **Renforcer admin** : admin-service (CRUD users, rôles, CRUD tenants) ; **`@cloudity/web`** (écrans Tenants, Users, Settings reliés à l'API, logout branché). Tests : pytest (health, tenants, users), vitest (App, Tenants, Users, Settings).

### Phase 1 — Password Manager MVP

- [x] **Backend passwords-service** (Go) : API REST (auth via gateway), CRUD vault/items, stockage blobs chiffrés côté client (serveur ne voit que ciphertext). Port 6051, route `/pass/*`.
- [x] **Schéma DB** : tables/schema `pass` (pass_vaults, pass_items) dans `infrastructure/postgresql/init/02-schema-pass.sql`.
- [ ] **App Flutter** (web + desktop Linux) : liste/CRUD mots de passe, déchiffrement côté client.
- [ ] **Extension navigateur** (Brave/Chrome, Manifest v3) : lecture/ajout, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis dans le Compose.
- [x] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API). Port 6050, route gateway `/mail/*`.
- [x] **Schéma DB mail** : `03-schema-mail.sql` (mail_domains, mail_mailboxes, mail_aliases).
- [ ] **mail-client-api** : *optionnel* — wrapper IMAP/SMTP si on extrait la logique hors **mail-directory-service** ; sinon reporter après stabilisation **§1c**.
- [ ] **Client mail Flutter** (web + Linux) : lecture/envoi, dossiers, étiquettes.
- [x] **Client mail web (`@cloudity/web`)** : envoi, sync IMAP, plusieurs boîtes, dossiers standard, pièces jointes en partie, polling / actualisation — **voir §1c M*** pour la suite (dossiers perso, règles, recherche full-text). *Un **mail-client-api** dédié reste optionnel* tant que l’UI parle au **mail-directory-service** via la gateway.
- [x] **Page Domaines** (`@cloudity/web`) : liste + création domaines mail, API /mail/domains.

### Phase 3 — Alias + intégration

- [ ] **API alias** dans mail-directory (création alias temp/permanent, expiration).
- [ ] **Extension Pass** : bouton « Créer alias » → appel API → stockage dans le vault.
- [ ] **UI Cloudity** : vue centralisée des alias.

### Phase 4 et après

- [ ] **Mail E2E** (OpenPGP) pour mails Cloudity–Cloudity.
- [x] **Drive (MVP)** : schéma DB `04-schema-drive.sql` (drive_nodes), **drive-service** (Go) avec CRUD dossiers/fichiers en cascade (list/create/rename/delete/upload/download), auth X-User-ID. Route gateway `/drive/*`. **Client web** : page Drive avec breadcrumb, création de dossiers en cascade, téléversement, renommer, supprimer, télécharger (type Google Drive / Nextcloud).
- [x] **Calendar, Notes, Tasks (MVP)** : schémas DB `05-schema-calendar.sql`, `06-schema-notes.sql`, `07-schema-tasks.sql`. **calendar-service**, **notes-service**, **tasks-service** (Go) avec DB, auth X-User-ID, CRUD complet. Routes gateway `/calendar/*`, `/notes/*`, `/tasks/*`. **Client web** : pages Agenda, Notes, Tâches connectées aux API (liste, création, mise à jour).
- [ ] **Éditeur de documents maison** : édition de documents (texte riche, tableur) depuis le Drive avec **notre propre** front (TipTap, Luckysheet ou équivalent open source intégré), sans OnlyOffice. **En cours** — voir `docs/produit/editeur-docs.md`.
- [ ] **Drive avancé** : chiffrement côté client (E2E), stockage objet pour gros fichiers.
- [x] **Photos (MVP)** : microservice **`photos-service`**, **`GET /photos/timeline`** (gateway), page Photos web, Flutter **`mobile/photos`**. Après mise à jour : **`docker compose up -d --build photos-service api-gateway`** (ou `make up`). **À faire** : auth mobile, albums, EXIF, WorkManager — `docs/produit/PHOTOS.md`.
- [ ] **Notes (type Google Keep)** : cartes, couleurs, épinglage, rappels, amélioration de l'UI actuelle. **Plus tard.**
- [ ] **Calendar** : vue agenda / semaine améliorée, rappels. **Plus tard.**
- [ ] **Administration** : renforcer écrans, rôles, audit. **Plus tard.**
- [ ] **Apps mobiles** Mail + Pass (Flutter).
- [ ] **Contacts** : app Contacts web + mobile (interconnectée Mail, Calendar, Tasks).
- [ ] **Photos** : app mobile + sync + extensions (au-delà du MVP web).
- [ ] **Prod** : Nginx Proxy Manager, TLS 1.3, backups chiffrés.

**Migrations DB** : au démarrage (**`make up`**), le service **db-migrate** applique automatiquement les scripts dans `infrastructure/postgresql/migrations/` (04-schema-drive, 05-calendar, 06-notes, 07-tasks, 20250225_mail). Aucune action manuelle : base existante ou nouvelle reçoit les migrations. En manuel : **`make migrate`**. **JWT** : l'auth-service persiste désormais **private.pem** et **public.pem** lorsqu'il génère les clés ; après un redémarrage, les mêmes clés sont rechargées et les tokens restent valides (plus besoin de se déconnecter/reconnecter). **Register** : si l'email existe déjà pour le tenant, l'API renvoie **409 Conflict** au lieu de 500 ; **make seed-admin** peut afficher un avertissement « compte déjà existant » sans erreur. En cas de 401 persistant (clé jamais générée), lancer **`make setup`** puis **`make up-full`**.

*Détail des phases et checklist complète : section 5 ci-dessous ; vision long terme et métriques : **[docs/produit/PlanImplementation.md](docs/produit/PlanImplementation.md)**.*

### Prochaines étapes (ordre recommandé)

À faire dans l'ordre pour avancer sans blocage :

| # | Tâche | Livrable | Tests |
|---|--------|-----------|--------|
| 1 | ~~**Schéma DB pass**~~ | ~~`02-schema-pass.sql`~~ | ✅ Fait. |
| 2 | ~~**Backend passwords-service**~~ | ~~Service 6051, CRUD vaults/items~~ | ✅ Fait (3 tests). |
| 3 | ~~**Intégration stack**~~ | ~~docker-compose, gateway `/pass`, make test~~ | ✅ Fait. |
| 3b | ~~**Dashboard : page Vaults**~~ | ~~Liste coffres, création, entrées (chiffrées)~~ | ✅ Fait (Vaults.tsx + tests). |
| 4 | **App Flutter Pass** (MVP) | App web + desktop Linux : login Cloudity, liste vaults/items, déchiffrement côté client. | Tests manuels ou intégration. |
| 5 | **Extension navigateur** (Manifest v3) | Lecture/ajout entrées, auto-fill simple. | Tests manuels. |
| 6 | **Phase 2 — Mail** | ~~Schéma mail~~, ~~mail-directory-service (Go)~~, gateway `/mail`. | ✅ Schéma + service + 4 tests. Reste : Postfix/Dovecot, mail-client-api, client Flutter. |

**Ensuite** : Phase 3 (alias), Phase 4 (Drive, E2E mail), Phase 5 (mobile, prod).

---

## 1b. Drive, éditeur de documents et corbeille (roadmap détaillée)

Priorité : **faire avancer l’application** (Drive, Office, corbeille) avec les fonctionnalités listées ci-dessous, **et** ajouter les tests nécessaires pour chaque ajout. Tout doit rester testable via **`make test`** (unit/app) et **`make test-e2e-playwright`** (parcours utilisateur).

### Drive — à faire

**Livré récemment (à documenter dans les releases)** : vue **Récents** plein écran (comme Corbeille) avec regroupement **par jour puis par heure**, bascule **grille / liste**, même cartes que le Drive ; API `recent` élargie (500 entrées, dossiers inclus) ; aperçu modale **sans recharger** au refresh JWT (ref token dans `FilePreviewContent`).

| # | Fonctionnalité | Détail | Tests à prévoir |
|---|----------------|--------|------------------|
| 1 | **Visualisation PDF intégrée** | Aperçu **embed** dans la modale (cible complémentaire : **PDF.js** pour zoom/recherche). | Unit : composant viewer ; E2E : ouvrir un PDF depuis le Drive. |
| 2 | **Extracteur d'archives** | Support : **zip**, **tar**, **tar.gz**, **tar.bz2**, **7z**, etc. Extraction **côté backend** en **conservant la structure** (dossiers → création de dossiers, fichiers à la bonne place). | API : endpoint extract (ex. POST /drive/nodes/:id/extract) ; tests Go ; E2E : upload archive → extraction → vérifier structure. |
| 3 | **Recherche globale** | **MVP livré** : palette (**Ctrl/Cmd+K**), **`?q=`** sur le Drive : terme non vide → **API** **`/drive/nodes/search`** (tout le Drive + emplacement parent) ; sinon filtre **client** sur le dossier courant ; raccourci **Contacts**. **À faire** : résultats **multi-apps** (Mail, Pass…) + groupement. | Unit : **GlobalSearchPalette**, **`fetchDriveSearch`**, **DrivePage** ; E2E : palette → Drive. Voir **TESTS.md** §4.0. |

### Éditeur de documents (Office) — à faire

| # | Fonctionnalité | Détail | Tests à prévoir |
|---|----------------|--------|------------------|
| 4 | **Renommer le document depuis l'éditeur** | Depuis Tableau de bord → Drive → [Document] : dans l'éditeur, pouvoir **renommer le document** (titre reflété dans le Drive, sauvegarde auto). Appliquer le **format/nom de fichier** (ex. .html, .csv). | Unit : renommage + sync nom ; E2E : créer document → ouvrir → renommer → vérifier dans Drive. |
| 5 | **Export PDF du document** | Depuis l'éditeur : bouton **Exporter en PDF** (génération côté client ou API). | Unit : génération PDF ou appel export ; E2E : éditeur → Export PDF → fichier téléchargé. |
| 6 | **Supprimer le document depuis l'éditeur** | Option **Supprimer** dans l'éditeur (avec confirmation) : envoie en **corbeille** ou suppression définitive selon politique. | Unit : action supprimer + redirection ; E2E : ouvrir doc → supprimer → retour Drive / corbeille. |
| 7 | **Présentation : enregistrement .pptx** | Comme document (.docx) et tableur (.xlsx) : pouvoir **enregistrer** une présentation en **.pptx** dans le Drive (création « Nouvelle présentation » en .pptx ou « Enregistrer en .pptx »). Téléchargement .pptx. Conversion vers d'autres formats plus tard. | Unit : html/diapos → blob pptx ; E2E : créer présentation → éditer → enregistrer .pptx. |
| 8 | **Approfondir l'éditeur** | Enrichir l'éditeur (formatage, styles, tableaux) selon la stack (TipTap, Luckysheet, etc.). Détail dans `docs/produit/editeur-docs.md`. | Tests au fil de l'eau. |
| 9 | **LaTeX comme source par défaut (Office)** | Objectif produit : mode **LaTeX** (ou équivalent) comme **format / source par défaut** pour documents avancés (formules, bibliographie) ; le **Markdown** reste une **option** (import/export, utilisateurs légers), **pas** le mode par défaut « tout en MD ». Prévoir rendu (KaTeX/MathJax ou PDF intermédiaire) + export `.tex` / PDF ; cadrage technique dans **`docs/produit/editeur-docs.md`**. | Unit : bascule modes, parse minimal ; E2E : ouvrir doc → mode LaTeX → sauvegarder. |
| 10 | **Interop .docx / HTML** | Conserver ouverture et export des documents **Drive** existants (.docx, HTML éditeur actuel) en parallèle du pipeline LaTeX. | Tests Vitest + E2E sur round-trip ciblé. |

### Corbeille (recycle bin) — à faire

| # | Fonctionnalité | Détail | Tests à prévoir |
|---|----------------|--------|------------------|
| 9 | **Corbeille unifiée** | Une **corbeille unique** groupant les éléments « supprimés » de : **Tasks**, **Contacts**, **Photos**, **Notes**, **Calendrier**, **Mail**, **Pass**, **Documents/Office**, **fichiers Drive**. Modèle : table `trash` ou `recycle_bin` avec `entity_type` + `entity_id` + métadonnées (nom, date suppression). | API : schéma DB + endpoints (list trash, restore, purge) ; tests backend ; E2E : supprimer → corbeille → restaurer. |
| 10 | **Restaurer un élément** | Depuis la corbeille : action **Restaurer** qui remet l'élément à sa place d'origine. | Unit : logique restore ; E2E : corbeille → restaurer → vérifier dans le module concerné. |
| 11 | **Vider la corbeille / purge** | Option pour vider la corbeille (suppression définitive) avec confirmation. | API + E2E. |

### Ordre recommandé (implémentation)

**Bloc Office/Éditeur (notre propre Word, Excel, PowerPoint — niveau Google Docs et au-delà)** — détail dans `docs/produit/editeur-docs.md` :

- [x] **Drawer** : barre de navigation gauche masquable/affichable sur **tous les écrans** (état en localStorage).
- [x] **Éditeur document** : barre d'outils (formatage), **mode Markdown** (basculable, conversion HTML ↔ MD).
- [x] **Renommer depuis l'éditeur** : champ ou modal pour renommer (sync Drive).
- [x] **Supprimer depuis l'éditeur** : bouton Supprimer → corbeille, redirection.
- [ ] **Export PDF** : bouton Exporter en PDF (document, tableur, présentation).
- [ ] **Mode LaTeX par défaut** : source / édition **LaTeX** en entrée principale du produit cible Office ; **Markdown** en option secondaire (cf. tableau §1b « Éditeur » lignes 9–10). Spec **`docs/produit/editeur-docs.md`**.
- [ ] **Éditeur Excel** : pousser le tableur (grille riche, formules, .xlsx).
- [ ] **Éditeur PowerPoint** : présentations complètes, enregistrement .pptx + PDF.

**Ensuite (ordre des apps — aligné priorité produit)** : **Photos** (compléter mobile + sync) → **Mail** → **Contacts** → **Pass** → puis Calendar, Notes, Tasks, Office selon charge. Puis : Corbeille unifiée, Recherche, Visualisation PDF, Extracteur d'archives.

*Mettre à jour les cases dans ce tableau au fur et à mesure. Les tests listés doivent être ajoutés dans les bons fichiers (voir [docs/operations/TESTS.md](docs/operations/TESTS.md)) et exécutables via `make test` et/ou `make test-e2e-playwright`.*

---

## 1c. À faire (reprise demain)

**À reprendre demain** — tout ce bloc est à implémenter et à couvrir par les tests.

### ZIP — ouverture en live (sans extraction définitive)

| # | Tâche | Détail | Tests |
|---|--------|--------|--------|
| Z1 | **Ouvrir un fichier .zip dans l’interface** | Voir le **contenu** du ZIP en live (liste des fichiers/dossiers dans l’archive) **sans** extraire définitivement sur le Drive. Affichage type explorateur : arborescence des entrées dans l’archive. | Unit : composant liste contenu ZIP ; E2E : clic sur .zip → vue contenu. |
| Z2 | **Backend : lister le contenu d’une archive** | Endpoint (ex. GET /drive/nodes/:id/archive/entries ou équivalent) qui retourne la liste des entrées d’un nœud de type fichier .zip (noms, tailles, chemin dans l’archive). Pas d’extraction côté serveur pour la lecture seule. | API Go : test endpoint list zip entries. |
| Z3 | **Compresser / décompresser dans le Drive** | **Compresser** : sélection de fichiers/dossiers → « Télécharger en ZIP » (déjà en place) ou « Créer une archive .zip » dans le Drive. **Décompresser** : upload d’un .zip → option « Extraire ici » (création des dossiers/fichiers dans le répertoire courant). | API : extract (POST) ; E2E : upload zip → extraire → vérifier structure. |

### Éditeur de document — style Office, barre et breadcrumb

| # | Tâche | Détail | Tests |
|---|--------|--------|--------|
| E1 | **Couleurs et rendu type Word/Office** | Améliorer l’éditeur : **couleurs** (texte, surlignage), styles plus riches, rendu proche d’un éditeur Office (Word-like). Options d’édition complètes (polices, tailles, couleurs, listes, etc.). | Unit : barre de formatage (couleurs, etc.) ; E2E : appliquer couleur → sauvegarder → rouvrir. |
| E2 | **Boutons Enregistrer et Télécharger à côté de Markdown** | Déplacer les boutons **Enregistrer** et **Télécharger** **en haut**, à côté du bouton **Markdown** (pas en bas ou ailleurs). Une seule barre d’outils en haut : Tableau de bord > Drive, renommer, Fermer, Markdown, Enregistrer, Télécharger. | Unit : présence des boutons en haut ; E2E : clic Enregistrer / Télécharger depuis la barre du haut. |
| E3 | **Breadcrumb en haut : Tableau de bord > Drive** | En haut de l’éditeur : afficher le **chemin** **Tableau de bord > Drive** (et éventuellement le nom du document cliquable pour renommer), **pas** « Drive > Sans titre.docx » comme chemin principal. Le titre du document reste éditable (renommer) à côté. | Unit : fil d’Ariane contient Tableau de bord et Drive ; E2E : breadcrumb cliquable. |
| E4 | **Bouton Fermer et Markdown en haut** | **Fermer le fichier** (retour au Drive ou au tableau de bord) et **basculer en mode Markdown** : les deux boutons doivent être **en haut**, visibles dès l’ouverture d’un fichier. Comportement type Office : barre unique avec navigation, renommer, Fermer, mode Markdown, Enregistrer, Télécharger. | Unit : boutons Fermer et Markdown en haut ; E2E : Fermer redirige, Markdown bascule l’affichage. |
| E5 | **Éditeur complet type Office** | Enrichir toutes les options d’édition (menus Fichier, Édition, Insertion, Format, Affichage) et la barre de formatage pour ressembler à un vrai Word/Office : plus d’options, couleurs, tableaux avancés, etc. | Tests au fil de l’eau (unit + E2E sur les actions principales). |

### Mail — récupération, frontend et base

**Messages console (Vite, CSS, favicons, « À l’instant » en corbeille)** : explications et causes dans **[docs/operations/PLAN.md](docs/operations/PLAN.md)** — à lire avant d’ouvrir un ticket « erreur navigateur ».

La détection IMAP/SMTP est **entièrement automatique** à partir de l’adresse : aucun domaine n’est codé en dur. Règles : fournisseurs connus (Gmail, Outlook, Yahoo, iCloud, OVH) via leur host dédié ; **toute autre adresse** → `imap.<domaine>` et `smtp.<domaine>` déduits du domaine (partie après @).

**Pour retester l’attachement d’une boîte mail** : dans l’app **Mail**, déconnecter l’adresse (menu ou bouton « Déconnecter »), puis la rajouter. En dev : **`make mail-clean-dev`** (après **`make up`**) supprime tous les comptes mail du compte démo en base ; vous restez connecté (le JWT est en localStorage), rechargez la page Mail puis ajoutez la boîte à nouveau.

| # | Tâche | Détail | Tests |
|---|--------|--------|--------|
| M1 | **Récupération des mails (sync IMAP)** | Déjà en place : POST /mail/me/accounts/:id/sync, connexion IMAP. **Toute adresse** gérée par détection automatique (voir ci-dessus). Stockage en-têtes dans `mail_messages`. **Correction** : si l’enveloppe IMAP n’a pas de `Date`, ne plus écrire `date_at = now()` — **`imap_folders.go`** + **`docs/operations/PLAN.md` §5**. **Chemins Corbeille / Envoyés / Spam / …** : LIST + attributs SPECIAL-USE + heuristique + colonne **`mail_imap_folders.imap_special_use`** (migration **23**) — **SYNC-BACKLOG §0b**. À améliorer : corps, PJ, état sync par dossier en UI. | API : sync avec un fournisseur quelconque ; E2E : ajouter boîte → sync → voir messages. |
| M2 | **Frontend Mail** | **En place** : liste messages, **sync IMAP** + **polling** arrière-plan (intervalle configurable), **Menu Mail** (fil d’Ariane) : paramètres app, Google OAuth, ajout boîte, **Actualiser (IMAP)** ; Paramètres panneau : « Sync maintenant » / « Sync avec mot de passe… » (**docs/operations/PLAN.md §9**), notifications nouveaux messages, panneau gauche réductible (comptes repliés, dossiers + sous-dossiers IMAP), réponse / transfert, rédaction panneau bas, signature localStorage, envoi sans ressaisir mot de passe, multi-sélection + actions masse, pagination `Page X / Y`, sélection page / inverser, **sélection boîte entière** (`Tout sélectionner (boîte)`) avec récupération de tous les IDs du périmètre courant, et actions de masse **optimisées par lot** (une requête batch par compte pour `read` / `folder`). **Tests backend batch** ajoutés (`mail-directory-service/main_test.go`) + **tests frontend MailPage** alignés batch sur les actions de masse (corbeille, archive, lu, non lu, spam, remise en réception). **Corps à l’ouverture** : backend IMAP + **UX** chargement / recharger si corps vide (**avril 2026**). Suite : stabilité React, sous-dossiers IMAP **CREATE**, threads. | Unit : MailPage ; E2E : ajout boîte, sync, envoi. |
| M3 | **Dossiers personnalisés** | Créer ses propres dossiers et sous-dossiers (indépendamment de Gmail/OVH), gérer la hiérarchie (dossier/sous-dossier/sous-sous-dossier), déplacer les messages. Backend : IMAP LIST/CREATE/MOVE ou structure propre en base. Corbeille mail, Brouillons, zone Envois programmés. | API : list/create/move folders ; E2E : créer dossier, déplacer message. |
| M4 | **Lecture, recherche, filtres** | Marquer lu / non lu dans la liste ; recherche full-text dans les messages ; filtres et tri (date, expéditeur, objet) ; « À lire plus tard » / liste en attente ; gestion de la file d’envoi (messages en attente). | API : flags read/unread, search endpoint ; E2E : marquer lu, recherche. |
| M5 | **Envoi programmé** | Programmer l’envoi d’un mail (date/heure). Backend : file d’envoi + worker ou cron. Interface : date/heure dans la fenêtre de rédaction. **UX cible** : entrée liste **« Programmés »** (vue Cloudity + calendrier / modification / annulation) en complément des brouillons — voir **SYNC-BACKLOG §12**. | API : scheduled_send ; E2E : programmer envoi. |
| M6 | **Dossiers et règles** | Dossiers personnalisés, sous-dossiers, déplacer messages, règles de tri auto. Conditions visées : expéditeur, destinataire, sujet, contenu, date/heure/plage horaire. Actions visées : déplacer dossier, marquer lu/non lu, spam, archiver. Inclure modification de règles + application rétroactive. Sync à la demande ou planifiée. | API : folders, rules. |
| M7 | **Spam** | Dossier Spam dans l'UI ; détection (scoring / Rspamd) ; marquer spam / non spam. | API : folder spam, flag. |
| M8 | **Paramètres et conversations** | Paramètres Mail : **signature** (déjà en place). UX compte mail (sync) : **livré** — champs **serveur IMAP/SMTP verrouillés** pendant la synchronisation de la boîte en cours + message explicite dans la modale ; enregistrement bloqué durant ce verrou. **Sync par boîte** (boutons dédiés) : livré — **PLAN §9**. **Règles par boîte** : **MVP livré** (CRUD, critères étendus, réconciliation IMAP best-effort) ; suite : tests API/E2E, raffinements. Conversations : grouper mails d'un même fil (thread) — **à faire**. **Corps du message** : backend **livrée** (fallback IMAP) ; **UX** : chargement + **Recharger le message** si corps vide (**avril 2026**). **Notifications hors page Mail** : watcher global **livré** ; PWA / SW — backlog. **Brouillons** : récupération et envoi à gérer (côté app mail). | Unit : paramètres, thread. |
| M9 | **Interconnexion Mail ↔ Drive / Calendar / Notes / Tasks / Contacts** | Drive (pièces jointes). À faire : Calendar, Notes, Tasks, Contacts (suggestions, expéditeur → fiche). | E2E : Mail → Drive, Contacts. |

### Tests à ajouter / à améliorer

- **ZIP** : tests unitaires (liste contenu ZIP, appel API) ; E2E (ouvrir .zip → voir contenu ; extraire ici).
- **Éditeur** : tests pour la nouvelle barre (Enregistrer, Télécharger, Markdown, Fermer en haut) ; breadcrumb Tableau de bord > Drive ; couleurs et options édition.
- **Mail** : tests sync IMAP (dont OVH), frontend liste/lecture/envoi ; E2E ajout boîte + sync. **Smokes Docker** : **`make test-auth`**, **`make test-go-one SERVICE=mail-directory-service`**, puis **`make test`** pour la batterie complète.
- **Rapport** : s’assurer que `make tests` et le rapport en console restent clairs (résumé, vulnérabilités, chemin du log).

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
| **Secrets / env** | **Pas de chiffrement dans le repo** | `.env` est dans `.gitignore` ; utiliser `.env.example` comme modèle. Si `.env` était déjà suivi par Git, lancer **`git rm --cached .env`** une fois (ou **`make create-env`**). Secrets en prod via variables d'environnement ou vault. |

**Résumé court**  
- **Hashing mots de passe** : Argon2id (déjà en place).  
- **Chiffrement vault / Drive (côté client)** : XChaCha20-Poly1305 + clé dérivée avec Argon2id.  
- **Transit** : TLS 1.3.  
- **JWT** : RS256 ou Ed25519.  
- **Mail E2E** : OpenPGP. **Backups** : restic/borg avec chiffrement intégré.

#### Cible **post-quantique** (résistance « harvest now, decrypt later »)

Tout ce qui est confidentiel **au-delà de 5–10 ans** (vault **Pass**, **mail** chiffré, **Drive** privé, exports légaux) doit migrer en **hybride classique + PQ** **avant** que les ordinateurs quantiques utiles existent. Les **primitives symétriques** restent solides (Grover ⇒ AES-256 ≈ 128 bits PQ) — l’effort porte sur **clés** (KEM) et **signatures**.

**Standards de référence (FIPS 2024, IETF)** :

| Famille | Standard PQ | Note |
|---------|-------------|------|
| **KEM** (échange de clés) | **ML-KEM** (= **CRYSTALS-Kyber**) — **FIPS 203** | tailles ML-KEM-512 / 768 / 1024 selon niveau |
| **Signatures (générales)** | **ML-DSA** (= **CRYSTALS-Dilithium**) — **FIPS 204** | ML-DSA-44 / 65 / 87 |
| **Signatures (conservatives, hash-based)** | **SLH-DSA** (= **SPHINCS+**) — **FIPS 205** | gros mais audit minimal |
| **Signatures (compactes)** | **FN-DSA** (= **Falcon**) — en cours NIST | utile pour certs / JWT |
| **Symétrique** | **AES-256-GCM**, **ChaCha20-Poly1305** | déjà PQ-safe |
| **Hash** | **SHA-256 / SHA-3 / BLAKE2** | déjà PQ-safe |

**Application Cloudity, par couche** :

| Couche | Cible PQ-safe | Comment / quand |
|--------|---------------|------------------|
| **TLS externe** (browser ↔ gateway) | **TLS 1.3 hybride** `X25519 + ML-KEM-768` (groupe `X25519MLKEM768`) | uniquement choix de **reverse proxy** (Caddy 2.8+, nginx + OpenSSL 3.5+, AWS-LC, BoringSSL) ; **rien dans le code applicatif**. |
| **mTLS interne** (services ↔ services) | démarrer **mTLS classique** (step-ca / cert-manager), basculer vers **certs hybrides ML-DSA + ECDSA** quand la PKI le permet | prérequis : commencer **mTLS aujourd’hui** ; PQ vient après. |
| **JWT signature** | aujourd’hui **RS256 (RSA-2048)** → palier **Ed25519** ; cible PQ **ML-DSA-65** ou **JWT hybride** (deux signatures vérifiées) | dépend de `golang-jwt` + supports clients ; commencer par **Ed25519** quand prêt. |
| **Vault Pass** (E2EE client) | enveloppe **hybride** : `ChaCha20-Poly1305` (contenu) + clé encapsulée en **X25519 ⊕ ML-KEM-768** ; KDF **Argon2id** + **HKDF-SHA-256** | format à **figer dès le MVP Pass** pour éviter une migration de tous les coffres ensuite. |
| **Mail E2E** | **OpenPGP** classique aujourd’hui ; cible **PQ/T hybrid OpenPGP** (draft IETF `crypto-refresh` + `pq`) | choisir lib qui suit le draft (rPGP, futurs binds Go). |
| **Drive / Photos privés** | chunks **AES-256-GCM** ou **XChaCha20-Poly1305** + clé fichier chiffrée par destinataire en **X25519 + ML-KEM-768** | les **chunks** sont déjà PQ-safe — c’est l’**enveloppe** qu’il faut hybrider. |
| **Backups** | **restic** (AES-256-GCM) ou **borg** (ChaCha20-Poly1305) ; passphrase via **Argon2id** | déjà PQ-safe pour le contenu. |
| **Refresh tokens** | aléa **CSPRNG** ≥ 256 bits + **SHA-256** | déjà PQ-safe (état actuel auth-service). |
| **Hash mot de passe** | **Argon2id** | déjà PQ-safe ; ajuster paramètres tous les 18–24 mois. |

**Priorisation pragmatique** :

1. **Court terme (avant PQ)** : **HSTS + CSP** au reverse-proxy, cookies httpOnly/Secure/SameSite, TLS 1.3 strict en prod, **mTLS interne** classique (step-ca).  
2. **Moyen terme** : activer **`X25519MLKEM768`** au reverse proxy dès qu’il est disponible dans la chaîne TLS utilisée ; **Ed25519** pour les nouveaux JWT ; **format vault Pass** déjà en enveloppe hybride.  
3. **Long terme** : **JWT hybrides / ML-DSA-65** quand `golang-jwt` + clients suivent ; **OpenPGP PQ/T hybrid** pour mail E2E ; **certs CA internes hybrides** ML-DSA + ECDSA.

**Règle d’or** : ce qui est **chiffré aujourd’hui pour 10 ans** doit déjà être **encapsulé en hybride** — sinon, prévoir une **migration ciphertext** côté serveur (réécriture des coffres / blobs) qui peut coûter cher.

### 2.4 Plan DNS (production)

En production, exposer les services via un reverse proxy (Nginx Proxy Manager, Nginx ou Traefik) avec TLS. Plan DNS recommandé (exemple avec un domaine `cloudity.example.com`) :

| Sous-domaine | Service | Rôle |
|--------------|---------|------|
| **api.cloudity.example.com** | api-gateway (6080) | API unifiée (auth, admin, pass, mail). |
| **app.cloudity.example.com** | cloudity-web (6001) | App web : landing, login, hub Drive/Pass/Mail, admin UI **`/4dm1n`**. |
| **auth.cloudity.example.com** | (optionnel) auth-service direct | Si accès direct auth utile (sinon tout via api.). |
| **mail.cloudity.example.com** | (Phase 2) Webmail / client | Client mail. |
| **pass.cloudity.example.com** | (optionnel) App Pass web | App Pass Flutter web. |

**À faire** : configurer les enregistrements A/AAAA (ou CNAME) vers le serveur hébergeant Docker ; configurer le proxy avec TLS 1.3 et HSTS ; en Phase 5 documenter les certificats (Let's Encrypt) et la résolution DNS réelle.

---

## 3. Branches et base de travail

- **Branche principale** : `main` (stable) ; intégration **`dev`** ; chantiers **`feat/<sujet>`**.
- **Branche chantier récente (Photos / mobile / sync / sécurité)** : **`feat/photos-gallery-mobile-sync-security`** — souvent la plus à jour pour ce périmètre ; fusionner vers **`dev`** après **`make test`** + revue.
- **Branches distantes possibles** : `develop`, `feature/*`, `release/*`, etc. — voir aussi **[docs/operations/BRANCHES.md](docs/operations/BRANCHES.md)**.
- **Recommandation** : `git fetch origin` ; rebaser ou merger depuis la branche d’intégration convenue en équipe ; ne pas laisser diverger **STATUS.md** / **BACKLOG.md** sur une branche trop longtemps.

---

## 4. État actuel (ce qui existe déjà)

### 4.1 Infrastructure

| Élément | Statut | Note |
|--------|--------|------|
| Docker Compose global | ✅ Présent | `docker-compose.yml` + `docker-compose.services.yml` |
| PostgreSQL 15 | ✅ Présent | Volume, healthcheck ; schéma dans `infrastructure/postgresql/init.sql` |
| Dossier `infrastructure/postgresql/init/` | ✅ En place | `init/01-schema.sql` contient le schéma ; le Compose monte ce dossier. `init.sql` à la racine postgresql conservé pour référence. |
| `postgresql.conf` / `redis.conf` | ✅ Résolu | Mounts retirés du Compose ; Postgres/Redis utilisent la config par défaut → plus d'erreur au démarrage. |
| Redis 7 | ✅ Présent | Mot de passe (command + healthcheck via shell pour expansion `REDIS_PASSWORD`), volume, healthcheck |
| Réseau Docker | ✅ Présent | `cloudity-network` |

### 4.2 Ports (60XX) — exposition host

Tous les **ports exposés sur l'hôte** sont en **60XX** pour éviter les conflits et garder une convention claire. À utiliser dans le navigateur / clients :

| Service | Port host (60XX) | Port conteneur | Accès navigateur / usage |
|---------|------------------|----------------|---------------------------|
| PostgreSQL | 6042 | 5432 | Connexion DB (ex. `localhost:6042`) |
| Redis | 6079 | 6379 | Connexion Redis (ex. `localhost:6079`) |
| auth-service | 6081 | 8081 | Direct (débogage) ; en prod tout passe par la gateway. |
| **api-gateway** | **6080** | 8000 | **API principale** : `http://localhost:6080` (à mettre dans `VITE_API_URL` ; Chrome bloque 6000, ERR_UNSAFE_PORT). |
| admin-service | 6082 | 8082 | Direct (débogage) ; en prod via gateway `/admin/*`. |
| passwords-service | 6051 | 8051 | Direct (débogage) ; en prod via gateway `/pass/*`. |
| **cloudity-web** | **6001** | 3000 | **App web** : `http://localhost:6001` (/, /login, /register, /app, **`/4dm1n`** admin). |
| Adminer (profil dev) | 6083 | 8080 | `http://localhost:6083` |
| Redis Commander (profil dev) | 6084 | 8081 | `http://localhost:6084` |

- **CORS** : l'api-gateway autorise `http://localhost:6001` et `http://localhost:5173` (ou `CORS_ORIGINS` dans l'env).
- **Nouveaux services** : exposer en 60XX (ex. mail-directory 6050, pass-manager 6051, mail-client-api 6052, etc.).

### 4.3 Schéma PostgreSQL actuel

- **Tables cœur** : `tenants`, `users`, `sessions`, `audit_logs` (RLS activé).
- **Déjà branchés** (migrations + services) : **mail** (`mail_*`), **pass** (`pass_*`), **drive** (`drive_nodes`), **calendar** (`calendar_events`), **notes** (`notes`), **tasks** (`task_lists` / `tasks`), **photos** (selon migrations photos) — détail dans `infrastructure/postgresql/migrations/` et schémas init.

### 4.4 Services backend

| Service | Stack | Statut | Détail |
|---------|--------|--------|--------|
| auth-service | Go (Gin) | ✅ OK | Health, Register/Login/Refresh/Validate, 2FA TOTP ; Argon2id, refresh avec rotation, JWT ; tests unitaires (main_test.go). |
| api-gateway | Go (Gorilla mux) | ✅ OK | Proxy **auth**, **admin**, **pass**, **mail**, **drive**, **calendar**, **notes**, **tasks**, **photos** ; CORS ; host **6080**. |
| admin-service | Python (FastAPI) | ✅ OK | CRUD tenants, CRUD users, **GET /admin/stats** (dashboard), health ; exposé host **6082** ; tests pytest (health, **stats**, tenants, users) — 21 tests. |
| **passwords-service** | Go (Gin) | ✅ OK | Health, CRUD vaults, CRUD items (ciphertext uniquement) ; auth via X-User-ID / X-Tenant-ID (gateway) ; port **6051**, route gateway `/pass/*` ; tests Go (health, auth requis) — 3 tests. |
| mail-directory-service | Go (Gin) | ✅ OK | Domaines, comptes, alias, sync IMAP, messages (API). Port **6050**, route gateway `/mail/*`. |
| mail-client-api | — | ⬜ Optionnel | Couche REST dédiée si besoin ; l’UI **Mail** utilise déjà **`/mail/*`** via la gateway. |
| calendar-service | Go (Gin) | ✅ OK | Événements (calendar_events). Port **6052**, route gateway `/calendar/*`. DB + auth X-User-ID. CRUD events. |
| notes-service | Go (Gin) | ✅ OK | Notes (table notes). Port **6053**, route gateway `/notes/*`. DB + auth X-User-ID. CRUD notes. |
| tasks-service | Go (Gin) | ✅ OK | Tâches et listes (task_lists, tasks). Port **6054**, route gateway `/tasks/*`. DB + auth X-User-ID. CRUD lists/tasks. |
| drive-service | Go (Gin) | ✅ OK | Fichiers et dossiers en cascade. Port **6055**, route gateway `/drive/*`. DB : `drive_nodes`. CRUD nodes, upload/download, récents, timeline photos secours. Auth via X-User-ID / X-Tenant-ID. |
| photos-service | Go (Gin) | ✅ OK | **GET /photos/timeline** (gateway `/photos/*`). Tests Go dans `make test`. |

### 4.5 Frontend & applications web (port 6001)

**Transition** : aujourd’hui une **seule app React** (**`frontend/apps/cloudity-web`**, **`@cloudity/web`**) sert l’accueil public, l’espace utilisateur et l’admin (**`/4dm1n`**) ; la cible est décrite en **§ 0b** (plusieurs apps + packages partagés, admin déployable à part).

Actuellement, cette app unique couvre :

| Route / page | Rôle | Statut |
|--------------|------|--------|
| **/** | Landing publique : hero, présentation Drive/Pass/Mail, liens Connexion / Créer un compte | ✅ |
| **/login** | Connexion (email + mot de passe uniquement ; pas de champ Tenant ID visible) | ✅ |
| **/register** | Inscription (email + mot de passe) | ✅ |
| **/app** | Hub : liens vers Drive, Office, Pass, Mail, Agenda, Notes, Tâches, Contacts, Photos | ✅ |
| **/app/drive** | Drive web : arborescence, téléversement, corbeille / récents, aperçus, recherche MVP **`?q=`** | ✅ |
| **/app/office** | Hub Office + éditeur documents (TipTap, etc.) | ✅ |
| **/app/pass** | Pass web : coffres et entrées ; déchiffrement côté client à renforcer (Flutter / extension) | ✅ |
| **/app/mail** | Client Mail web : boîtes, dossiers, sync IMAP, envoi, brouillons partiels, PJ — suite **§1c** | ✅ |
| **/app/calendar**, **/app/notes**, **/app/tasks** | Agenda, Notes, Tâches (CRUD + UI) | ✅ |
| **/app/contacts** | Contacts (carnet, recherche, import) | ✅ |
| **/app/photos** | Galerie timeline (API photos-service) | ✅ (MVP) |
| **/app/corbeille** | Corbeille Drive (vue dédiée) | ✅ |
| **/app/settings** | Paramètres utilisateur (session) ; à enrichir (profil, préférences) | ✅ |
| **/4dm1n** | Administration (UI) : tableau de bord, Tenants, Users, Vaults, Domaines mail, Settings — **pas de chemin `/admin` côté UI** (404 / refus explicite) | ✅ |

**Connexion** : l'utilisateur se connecte avec **email + mot de passe** uniquement. Le frontend envoie `tenant_id: 1` par défaut à l'API (backend actuel exige encore `tenant_id`). Une évolution backend (ex. résolution du tenant par domaine email ou endpoint dédié) permettra de supprimer complètement la notion de tenant côté utilisateur.

**Design** : Tailwind CSS, palette brand/slate, typo DM Sans, sidebar claire pour l’app et l'admin.

**Applications web comme modules** : Drive, Pass, Mail, Office, Agenda, Notes, Tâches, Contacts, Photos et Admin sont des **modules** dans **`@cloudity/web`** (`/app/*`, **`/4dm1n`** pour l’UI admin), chacun derrière la gateway (`/drive/*`, `/mail/*`, `/photos/*`, …). Le shell fournit auth, layout, **recherche MVP** (palette globale) et notifications. Pour étendre : route + page (+ service + préfixe gateway si nouveau domaine). Clients **Flutter** / PWA réutilisent les mêmes APIs — voir **MOBILES.md**. *Cible long terme* : extraire le hub utilisateur et le back-office en apps dédiées — voir **docs/architecture/ARCHITECTURE-FRONTENDS.md** (**`@cloudity/shared`** déjà en place).

| App / cible | Stack | Statut | Détail |
|-------------|--------|--------|--------|
| **App web unifiée** (6001) | React (Vite, TanStack Query, Tailwind) | ✅ OK | Suite **§4.5** (Hub, Drive, Mail, Office, Pass, Agenda, Notes, Tâches, Contacts, Photos) + **`/4dm1n`**. |
| Mail (web/desktop) | Flutter | ❌ À faire | Phase 2 (client riche). |
| Password Manager (desktop) | Flutter | ❌ À faire | Phase 1 (optionnel si web Pass suffit). |
| Extensions navigateur (Pass) | JS/TS Manifest v3 | ❌ À faire | Phase 1 (MVP) puis Phase 3 (alias). |
| admin_app (mobile) | Flutter | 🟡 Squelette | Structure de base uniquement. |
| Apps mobiles Mail / Pass | Flutter | ❌ À faire | Après MVP web/desktop. |

### 4.6 Scripts et outillage

Index : **`scripts/README.md`** (`db/`, `mobile/`, `ci/`, `dev/`). Exemples : **`scripts/dev/setup.sh`**, **`scripts/dev/diagnose.sh`**, **`scripts/db/migrate-db.sh`** (monté dans **db-migrate**).
- **Migrations** : dossier **`infrastructure/postgresql/migrations/`** + service **db-migrate** au `make up` — outil externe type golang-migrate **optionnel** si besoin de versioning plus strict.

### 4.7 Base pour avancer (à étendre)

| Composant | Rôle | Prochaine étape |
|-----------|------|------------------|
| **`@cloudity/web`** (React/Vite) | Suite + admin UI | Renforcer (tenants, users, settings) ; servir de modèle pour Mail/Pass UI. |
| **admin-service** (FastAPI) | CRUD tenants, API admin | Étendre (users, rôles) ; même pattern pour mail-directory et passwords-service. |
| **auth-service** (Go) | Login, register, JWT, 2FA | Consolider (Argon2id, refresh tokens) puis brancher tous les fronts. |
| **api-gateway** (Go) | Reverse proxy + CORS | Routes **/mail**, **/pass**, **/drive**, **/calendar**, **/notes**, **/tasks**, **/photos** déjà branchées ; étendre pour nouveaux services. |

Pour **Mail Core** : ajouter Postfix, Dovecot, Rspamd + **mail-directory-service** (Go) + schéma DB mail.  
Pour **Password Manager** : consolider **passwords-service** (Go) + schéma pass + app Flutter + extension navigateur.  
Voir checklist Phase 1 et Phase 2 ci-dessous.

---

## 5. Roadmap par phases (checklist détaillée)

Les phases ci-dessous sont alignées avec la vision “Proton Mail + Pass + Gmail + Drive” et le plan d'implémentation détaillé. **Cocher au fur et à mesure** pour suivre l'avancement.

### Phase 0 — Infra commune

- [x] Repo / structure : docker-compose global (Postgres, Redis, auth, gateway, admin, dashboard).
- [x] Fichiers `postgresql.conf` et `redis.conf` : mounts retirés du Compose (config par défaut) → démarrage sans erreur.
- [x] Init PostgreSQL fiable : scripts dans `infrastructure/postgresql/init/` (01-schema.sql, 02-schema-pass.sql).
- [ ] Templates ou structure type pour nouveaux services (Go backend, Flutter front).
- [x] **Migrations DB versionnées** : dossier **`infrastructure/postgresql/migrations/`** appliqué au **`make up`** via **db-migrate** ; outil externe (golang-migrate / Flyway) **optionnel** pour historique plus strict.

### Phase 1 — Auth + Password Manager MVP

- [x] **Auth Cloudity** : login/register, Argon2id, JWT + refresh tokens (rotation), 2FA TOTP (auth-service).
- [x] **Password Manager backend** (Go) : CRUD vaults/items, auth via gateway, stockage blobs chiffrés côté client.
- [x] **DB** : schéma `pass` (pass_vaults, pass_items) dans 02-schema-pass.sql.
- [ ] **Front Flutter** : Web + Desktop Linux (liste, CRUD mots de passe, déchiffrement côté client).
- [ ] **Extension navigateur** (Brave/Chrome) : lecture/ajout d'entrées, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis + PostgreSQL (Docker Compose).
- [x] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API). Health + GET/POST /mail/domains.
- [x] **Schéma DB mail** : domains, mailboxes, aliases dans 03-schema-mail.sql.
- [x] **UI admin — domaines mail** : écran **Domaines** (création / liste) branché sur **`/mail/domains`**.
- [ ] **UI admin — suite** : supervision comptes, quotas, outils op (au-delà des domaines).
- [ ] **mail-client-api** : *optionnel* (voir §4.4) — REST dédié si extraction de la logique IMAP.
- [ ] **Client mail Flutter** : Web + Linux (lecture/envoi, dossiers, étiquettes, règles simples type Sieve).

### Phase 3 — Intégration alias + Password Manager

- [ ] **API alias** unifiée dans mail-directory-service (création alias temporaire/permanent, expiration).
- [ ] **Extension Pass** : bouton “Créer alias” → appel API → remplissage champ email + stockage dans vault.
- [ ] **UI Cloudity** : vue centralisée alias, règles de forwarding, expiration.

### Phase 4 — E2E mail + Drive avancé

- [ ] **Mail E2E** : chiffrement OpenPGP pour mails Cloudity–Cloudity (gestion clés, import/export).
- [x] **Drive (MVP web + API)** : **drive-service** + page **/app/drive** (déjà livré — voir §1 et §4.4).
- [ ] **Drive avancé** : chiffrement côté client (E2E), stockage objet pour très gros fichiers, client **Flutter** dédié.

### Phase 5 — Mobile et finalisation

- [ ] **Apps mobiles** : Mail et Password Manager (Flutter) pour Android/iOS.
- [ ] **Sync** : cohérence multi-app (vault, mail, drive).
- [ ] **Sécurité** : audit logs, backups chiffrés (ex. restic/borg), tests de restauration.
- [ ] **Prod** : Nginx Proxy Manager (ou Nginx/Traefik), TLS 1.3, HSTS, headers sécurité, rate limiting.

---

## 6. Migrations et nettoyage à faire

- [x] **Init PostgreSQL** : le schéma initial est dans `infrastructure/postgresql/init/01-schema.sql` ; le Compose monte ce dossier.
- [x] **Ports 60XX** : tous les services exposés en 60XX (6042, 6079, 6081, **6080** (API), 6082, 6001, 6083, 6084) ; `VITE_API_URL=http://localhost:6080` et CORS mis à jour.
- [ ] **Alignement schéma auth** : `users.tenant_id` (INTEGER vs UUID), retour de `uuid` vs `id` selon les services (auth-service utilise `id` dans l'INSERT).
- [ ] **Migrations DB versionnées** : dossier `infrastructure/postgresql/migrations/` + README créés ; appliquer les migrations à la main ou via outil (golang-migrate, Flyway).
- [ ] **Branches** : travailler depuis `main` ; merger `develop` / `feature/*` une fois validé.
- [ ] **Login par email seul (sans tenant)** : côté backend, optionnel — résolution du tenant par domaine email ou endpoint (ex. GET /auth/tenants?email=…) pour que l'utilisateur n'ait jamais à saisir d'organisation. Actuellement le frontend envoie `tenant_id: 1` par défaut.
- [x] **Documentation de base** : **STATUS.md**, **BACKLOG.md**, index **docs/README.md**, **TESTS.md**, **SYNC-BACKLOG**, **SECURITE.md**, **SECURITE-DONNEES**, **ROADMAP**, **MOBILES**, **BRANCHES** — *maintenir à chaque livraison significative*.
- [ ] **Documentation** : relire **PlanImplementation**, **MAIL-GMAIL-OAUTH**, **PHOTOS** après chaque merge majeur ; éviter les doublons entre STATUS et ROADMAP (STATUS = état + prochaines étapes courtes).

---

## 7. Références croisées

- **Roadmap produits & transversal** : **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)** (applications, sécurité, infra, API, template nouvelle app).
- **Mobile (web vs app, admin mobile)** : **[docs/produit/MOBILES.md](docs/produit/MOBILES.md)**.
- **Tests** : **[docs/operations/TESTS.md](docs/operations/TESTS.md)** (référence unique des commandes et de la couverture).
- **Sécurité & confiance (cadre produit)** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** ; chiffrement / durcissement : **[docs/securite/SECURITE-DONNEES.md](docs/securite/SECURITE-DONNEES.md)**.
- **Backlog condensé** : **[BACKLOG.md](./BACKLOG.md)** (racine).
- **Plan long terme** : **[docs/produit/PlanImplementation.md](docs/produit/PlanImplementation.md)** (phases 1–6, métriques, ressources).
- **Index du dossier documentation** : **[docs/README.md](./docs/README.md)** (éditeur, architecture front, évolution plateforme, sécurité, TODO dev).
- **Sync & mobile & session + mail serveur** : **[docs/produit/SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)** (priorités de travail ; détail ROADMAP **TR-07**).
- **Mail — OAuth Google (Gmail)** : **[docs/produit/MAIL-GMAIL-OAUTH.md](docs/produit/MAIL-GMAIL-OAUTH.md)**.
- **Vision détaillée** : **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)** et **[docs/produit/PlanImplementation.md](docs/produit/PlanImplementation.md)** ; historique de demande / contexte produit dans les échanges du projet.
- **Architecture technique** : `README.md` (vue d’ensemble) ; approfondissements **docs/** (ex. **[docs/architecture/ARCHITECTURE-FRONTENDS.md](docs/architecture/ARCHITECTURE-FRONTENDS.md)**, **[docs/architecture/EVOLUTION-PLATEFORME.md](docs/architecture/EVOLUTION-PLATEFORME.md)**).
- **Docker** : `docker-compose.yml` (dev complet), `docker-compose.services.yml` (services seuls).

---

*Ce fichier sert de **référence unique** pour l'avancement du projet CLOUDITY. Mettre à jour les cases et la date à chaque avancée significative.*
