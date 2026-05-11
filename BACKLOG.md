# CLOUDITY — Backlog produit & technique

**Rôle** : liste **actionnable** des prochaines livraisons et dettes connues. Pour le détail sync / mobile / session / archivage mail, voir **[docs/produit/SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)**. Pour les fiches par application (**APP-01** … **TR-07**), voir **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)**. **Sécurité & confiance (vision, phases, Zero Trust, signatures, WAF)** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)**. **Suivi quotidien** : **[STATUS.md](./STATUS.md)**. **Tests** : **[docs/operations/TESTS.md](docs/operations/TESTS.md)**.

**Vision suite (ordre stratégique + décisions produit)** — ne remplace pas ce fichier : **[docs/produit/VISION-SUITE.md](docs/produit/VISION-SUITE.md)** (couches P0–P7, phases A–F, lien avec **PERFORMANCES.md** et l’état réel Mail / Photos / Pass).

**Convention** : cocher ici ou dans **TESTS.md** §4 quand une ligne est livrée ; garder **STATUS.md** à jour (date + § pertinents).

---

## Démarrage rapide (ordre recommandé)

| Étape | Action |
|-------|--------|
| 0 | *(Optionnel mais recommandé)* Lire **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** pour le cadre *Google + Proton* et les phases |
| 1 | **`make setup`** (ou `./scripts/dev/setup.sh`) si première machine |
| 2 | **`make up`** ou **`make up-full`** (seed démo : **admin@cloudity.local** / **Admin123!**) |
| 2b | Quand de nouveaux **`infrastructure/postgresql/migrations/*.sql`** apparaissent (sync du dépôt ou branche) : **`make migrate`** ou **`make rebuild`** — **TESTS.md** (Migrations) |
| 3 | Attendre **20–30 s** puis ouvrir http://localhost:6001 |
| 4 | **`make test`** (Docker requis) avant tout merge |
| 5 | E2E navigateur : **`make seed-admin`** puis **`make test-e2e-playwright`** |

**URLs** : app http://localhost:6001 · API gateway http://localhost:6080 · détail **STATUS.md** §0.

---

## Priorités — deux niveaux (à lire ensemble)

1. **Stratégie long terme** (*quoi valoriser en premier comme suite*) : **[docs/produit/VISION-SUITE.md](docs/produit/VISION-SUITE.md)** — Mail → Alias → Pass → Photos → Drive → Contacts/Calendar → Office, avec fondation transverse (perf **PERFORMANCES.md**, sécu **SECURITE.md**, recherche).
2. **Backlog exécutable ci-dessous** — ordre **pratique avril 2026** sur le dépôt : chantiers **parallèles** (Mail déjà très avancé, Photos mobile + web, Pass, Drive…) tel que **STATUS** et **TODO**.

| # | Sujet | Détail / lien |
|---|--------|----------------|
| 1 | **Photos** | API timeline, galerie web, **mobile/photos**, sync sobre — **docs/produit/PHOTOS.md** |
| 2 | **Mail** | Dossiers IMAP §0b SYNC-BACKLOG (dont **logs** probes / gateway), recherche §9, PJ, archivage §1 |
| 3 | **Pass** | Style Proton, alias — **ROADMAP APP-04** |
| 4 | **Contacts** | Groupes, import/export ; **lien Mail ↔ fiches** (liaison riche, règles) **après MVP Mail web** — l’ouverture contact depuis un message existe déjà côté UI |
| 5 | **Recherche** | **Livré (MVP web)** : palette **Ctrl+K**, `?q=` : filtre **client** dans le dossier courant **ou** recherche **API** sur **tout le Drive** si `q` non vide (`GET /drive/nodes/search`) + lien Contacts ; **À faire** : recherche cross-apps (Mail, Pass…) — **TESTS.md** §4.0 |
| 6 | **Architecture front** | Monorepo multi-apps — **STATUS.md** §0b (**A1** workspaces ✅ ; **A2/A3** `cloudityCore.ts` ; **A3.1** Mail dossiers / IMAP+BDD ; **A4–A10**) |
| 7 | **Drive mobile** | MVP **`mobile/drive`** (liste) + tests **`make test-mobile-drive`** ; alignement barre (loupe, notif) — **MOBILES.md** |
| 8 | **Sécurité transverse** | Phases §3 **SECURITE.md** + durcissement **SECURITE-DONNEES.md** ; pas de doublon avec ROADMAP TR-01 |
| 9 | **Observabilité & performances** | Mesure détaillée (web, gateway, services Go, Flutter) ; budgets / p95 ; pistes d’optimisation **sans** rogner **SECURITE.md** ni l’UX — **docs/operations/PERFORMANCES.md**, **ROADMAP TR-06** |

### Suite « Google + Proton » (rappel)

Ordre **must-have** : sync/versioning/corbeille → partage propre → backup photo → E2EE espaces privés → galerie riche → recherche privée / anti-abus. Détail des **4 couches** et **phases 1–4** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)**.

---

## Architecture multi-repos GitHub (à trancher)

Cible discutée : casser le monorepo en **dépôts GitHub indépendants** (un par service / app / lib partagée) regroupés sous un **meta-repo** `cloudity` qui garde `docker-compose.yml`, `infrastructure/`, docs transverses, E2E.

**Plan détaillé** : **[docs/architecture/MULTI-REPO-LAYOUT.md](docs/architecture/MULTI-REPO-LAYOUT.md)** — couvre : carte des dépôts (~17–25), trois options techniques (submodules / subtrees / manifeste / monorepo + CODEOWNERS), prérequis Phase 0 (extraire **`backend/pkg/dbpin`**, versionner **`internalsec`**, **`@cloudity/shared`**, **`cloudity_shared`** Dart), intégrations cross-app (Mail ↔ Contacts, Pass ↔ Mail aliases, Drive ↔ Mail PJ) **via le gateway** + contrats **OpenAPI**, tests par niveau (unit / contract / E2E), et production **Portainer + nginx-proxy-manager** (mono-stack vs stacks par domaine, NPM TLS / hostnames, backup **Restic** + résilience UI).

**Questionnaire (QCM + texte libre court)** : **[docs/decisions/multi-repo/QUESTIONNAIRE.md](docs/decisions/multi-repo/QUESTIONNAIRE.md)** — détail des options.  
**→ Remplir tes choix dans** : **[docs/decisions/multi-repo/REPONSES.md](docs/decisions/multi-repo/REPONSES.md)** (synthèse `Q1=… Q10=…` + texte libre).

- [ ] **Décisions** : compléter `REPONSES.md` (ou coller la synthèse en chat) puis cocher ici.
- [ ] **Phase 0 — sans scission** : extraire `backend/pkg/dbpin` (lib Go) pour casser la duplication `dbpin.go` (7 services).
- [ ] **Phase 0 — sans scission** : tagger `internalsec` `v0.1.0`, publier `@cloudity/shared` `v0.1.0`, tagger `cloudity_shared` Dart `v0.1.0`.
- [ ] **Phase 0 — sans scission** : esquisser **`docs/cloudity-api-contracts/`** (OpenAPI par service — gateway, mail, drive, pass, calendar, contacts, notes, tasks, photos, admin) pour figer le contrat avant scission.
- [ ] **Production** : retoucher **REVERSE-PROXY.md** pour intégrer le scénario **NPM** (subdomains `api.`, `app.`, `admin.` → conteneurs) + checklist Portainer (mono-stack vs multi-stacks par domaine).
- [ ] **Backup / résilience UI** : conception du panneau `/4dm1n/backups` (Restic + snapshots PG, plan quotidien, restauration 1 clic) + healthchecks/replicas Compose pour la résilience.

> Tant que ces décisions ne sont pas prises, **aucune** scission n’est lancée : on continue à livrer dans le monorepo.

---

## Sprint fin mai 2026 — cible migration type Proton

Objectif : usages **quotidiens** **web + mobile** pour **Mail**, **Drive**, **Photos** ; **Pass** au minimum **web** fiable ; **app Pass mobile** et **extension navigateur Pass** dès que le contrat API / UX web est figé.

| Bloc | Web | Mobile | Notes |
|------|-----|--------|-------|
| **Photos** (galerie + sync) | Timeline, albums partiels, upload | `mobile/photos` : timeline paginée (`offset`) ; **à renforcer** : **WorkManager**, reprise après coupure, option Wi‑Fi uniquement — **PHOTOS.md** § 4–5, **MOBILES.md** |
| **Mail** (dont alias) | Très avancé ; alias boîte **MVP** ; alias domaine (**`/4dm1n`** → Domaines) | `mobile/mail` : envoi, PJ, dossiers ; **reste** : brouillon serveur, push — **MOBILES.md** § 5 |
| **Drive** | Récents, corbeille, recherche `?q=` | `mobile/drive` : navigation dossiers ; vérifier **upload** / téléchargement vs besoin Proton |
| **Pass** | MVP coffre web | **Pas de `mobile/pass` dans le dépôt** — à créer (Flutter + `path: ../cloudity_shared`) ; **extension** : chantier **non démarré** (cible **MV3**, dossier type `extensions/cloudity-pass/`) — **ROADMAP APP-04** |

**Checklist tests manuels** (toi, après `make up` + compte) : **Mail** envoi/réception, PJ, création **alias boîte** + réception ; **alias domaine** (admin + DNS si domaine réel) ; **Drive** upload + corbeille + recherche ; **Photos** import web + même compte sur **app mobile** ; **Pass** CRUD + session.

---

## À faire (extraits — non exhaustif)

### Infra base de données (migrations)

- [ ] **Outil / panneau migrations** : CLI ou service + **admin web** + **admin mobile** — état des migrations, version, garde-fous (pas d’exécution SQL libre sans audit) — **SYNC-BACKLOG §0d**, **PLAN §11**, **TESTS.md**.

### Sécurité & infra (voir **SECURITE.md**)

- [x] **Gateway — anti-énumération & durcissement** : 404/405 JSON homogènes ; en-têtes `nosniff` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` ; rate limit global + **login/register** ; `429` en JSON ; **`Cache-Control: no-store`** sur `/auth/*`, `/pass/*`, `/admin/*` ; auth : message inscription doublon générique, plancher temps réponse login — **SECURITE.md** § 6.1, tests `TestSensitivePath_*`, `TestLoginRateLimit_*`, `TestUnknownPath_*`.
- [x] **Frontend** : `public/robots.txt` (`Disallow` `/4dm1n`, `/admin`, `/auth/`, etc.) ; navigation **shell utilisateur ↔ admin** en pleine page (`window.location.assign`) pour charger le bon bundle.
- [ ] **Prod / reverse proxy** : confirmer qu’aucune couche ne **strip** `Cache-Control`, CSP, HSTS — **REVERSE-PROXY.md** ; WAF / rate limit **par IP** en complément du gateway.
- [x] **Remédiation dépendances front (suite `make test-security`)** : lot `admin-dashboard` traité (MAJ contrôlées tooling + dépendances). **`xlsx` retiré** au profit de `read-excel-file` / `write-excel-file` dans l’éditeur Office ; revalidation Vitest/Playwright OK, audit npm dashboard à 0 vulnérabilité.
- [x] **Qualification/remédiation `govulncheck` (services Go)** : standardisation du scan sécurité sur toolchain patchée (`golang:1.25.9-alpine`) + MAJ `golang.org/x/net` sur `photos-service` + alignement des images Go dev (`1.25`) ; `make test-security` vert côté govulncheck.
- [ ] **Phase 1** : versioning Drive + corbeille unifiée (si pas déjà complet côté produit) ; politique **snapshots** à trancher.
- [ ] **Signatures applicatives** : spec canonical request + nonces pour **exports**, **admin critique**, webhooks ; pas sur toute l’API.
- [ ] **Zero Trust incrémental** : scopes JWT par route ; mTLS ou tokens service inter-microservices documentés.
- [ ] **WAF** : eval NGINX + ModSecurity + CRS (mode détection) devant gateway ; tuning faux positifs.
- [ ] **Audit log** utilisateur / admin (actions sensibles) — lié **SECURITE-DONNEES.md** moyen terme.

### UX / Suite web (`frontend/apps/cloudity-web`, **`@cloudity/web`**)

- [x] **Mail web — rationalisation actions latérales** : suppression des doublons (`Nouveau`, `Recharger`, `Paramètres Mail`, `Filtres et règles`) quand déjà présents dans `Menu Mail`.
- [x] **Mail web — compose riche** : barre de formatage de base (gras/italique/souligné/listes/lien), transfert en HTML lisible et titre compose explicite.
- [x] **Mail web — programmer l’envoi** : remplacer la popup navigateur par une modale interne date/heure.
- [x] **Gateway — contrôle d’accès admin-only** : verrouiller `/mail/domains*`, `/mail/mailboxes*`, `/mail/aliases*` côté gateway avec tests unitaires.
- [ ] **Mail web — doc & robustesse** : console navigateur (Vite, CSS mail HTML, favicons) et **dates liste corbeille** — voir **`docs/operations/PLAN.md`** ; sync **`date_at`** sans `time.Now()` si enveloppe IMAP sans date (**mail-directory-service**). **Livré** : sync auto anti-rafale (batch unique, anti-chevauchement, pause onglet caché) + indicateur sidebar. Alias boîte **MVP** ; système **complet** (expiration, vue globale, DNS) : **SYNC-BACKLOG §2**, **STATUS** Phase 3, **ROADMAP APP-04**.
- [x] **Mail web — stabilité React** : correctif **setters / affichage** + **`MailAppChromeMenu`** ; **`make test`** + **`make test-dashboard-one …MailPage.test.tsx`** + **`make test-e2e-playwright-mail`** (écoute console / navigation Mail ↔ Drive). **Optionnel** : garde manuelle longue session / multi-onglets ; réduire bruit **`JWT expired`** sur batch sync (file d’attente côté front).
- [ ] **Mail — règles de tri (type Proton)** : **MVP livré** (CRUD, critères étendus, réconciliation IMAP). **Reste** : tests API / E2E (conditions combinées, application rétroactive scénarisée), polish UX ; tracking **STATUS §0b A3.2**, **SYNC-BACKLOG §0b**.
- [ ] Recherche globale **API** cross-apps (Mail, Pass…) — **Drive** : recherche nom sur **tout l’arborescence** via **`GET /drive/nodes/search`** quand **`?q=`** est renseigné dans le dashboard ; navigation **Contacts** inchangée.
- [ ] Hub : recherche cross-apps (alignée ROADMAP).
- [ ] Playwright : scénario ouverture palette recherche + `?q=` sur Drive (optionnel).

### Observabilité / Performance (TR-06)

- [x] Endpoint admin runtime de base : `GET /admin/performance/overview` (snapshot cgroup + docker stats si disponible) + rendu dashboard admin.
- [ ] Collecte métriques **par service** (gateway + microservices + front) : latence p50/p95/p99, erreurs, CPU/Mémoire/IO.
- [ ] Historisation métriques + exploration dans l’admin (filtres service/route/période).
- [ ] Traçabilité des exécutions CI/dev (`make test`, E2E, mobile) avec empreinte ressources.
- [ ] Budgets et seuils automatiques (alerte / fail pipeline) pour éviter les régressions CPU/Mémoire/IO.

### Catalogue apps (hors coeur deja suivi)

- [ ] **Gate priorite** : ne lancer ce catalogue qu'apres stabilisation des blocs coeur (Drive/Mail/Photos/Pass), puis Calendar/Notes/Tasks/Contacts.
- [ ] **Vague A (catalogue tardif mais logique)** : Bookmarks/Read later, Wiki/Knowledge Base, Kanban/Boards, Forms/Surveys, Sites/Pages, Journal/Daily log, Habits/Routines, Snippets/Templates, Web clipper, Receipts/Documents perso, RSS/News reader, Scanner documents.
- [ ] **Vague B (apres Vague A)** : PKM/Knowledge graph, Whiteboard/Canvas, PDF annotation, Reference manager, Clipboard sync, File requests/Collect, Vault documents sensibles, Workflow automation transversal, Activity stream global, Universal search, Secure share center, Developer hub, Backup center, Device center, App launcher.
- [ ] **Vague C (long terme, complexite elevee)** : Chat/Team messaging, Meet/Calls, Security/Admin center avance (gouvernance, retention, legal hold), marketplace d'integrations, mini CRM/client portal, no-code tables, home automation, e-signature, assistant IA transversal.

### Mobile

- [x] **Drive** Flutter (`mobile/drive`) : liste fichiers — **`make test-mobile-drive`** / suite — **MOBILES.md**.
- [x] **Photos** Flutter : **`make test-mobile-photos`** / suite.
- [x] **Mail** Flutter (`mobile/mail`) : multi-boîtes, dossiers, lu, **PJ téléchargeable / partage**, **envoi minimal** (`POST /mail/me/send`), tests `mail_validation` — **`make test-mobile-mail`** ; à poursuivre : brouillon **serveur**, PJ inline, push — **MOBILES.md** §5.
- [ ] Aligner barre d’app (loupe, notifications) avec le web — rappel dans **GlobalSearchPalette** (texte d’aide UI).

### Backend / infra

- [x] **contacts-service** : **`main_test.go`** (health, 401 sans `X-User-ID`, liste vide si DB absente) — inclus dans **`make test`** / **`make test-docker`** / **govulncheck** (`scripts/ci/test-security.sh`).
- [x] **Mail + gateway — bruit `make logs`** : SELECT IMAP sur noms absents (multi-fournisseur) sans log `[mail] sync select` ; ordre candidats **archive** (Gmail en dernier) ; **api-gateway** : **context.Canceled** sur reverse proxy sans spam — **SYNC-BACKLOG §0b** (paragraphe logs), **`mail-directory-service/imap_folders.go`**, **`api-gateway/main.go`**.
- [ ] Mail archivage longue durée + full-text — **SYNC-BACKLOG** §1, **ROADMAP APP-01**.

### Qualité & CI

- [ ] **`make test`** systématique sur **Docker** ; **`make test-docker`** après **`make up`** pour valider l’image runtime.
- [x] Couverture **GlobalSearchPalette** (Vitest) : raccourci clavier, navigation — **`GlobalSearchPalette.test.tsx`** (voir **TESTS.md**).

---

## Récemment aligné (référence)

- **Tests** : `make test` 100 % orienté conteneurs (Go `--no-deps`, admin conditionnel, Vitest dashboard).
- **Recherche (MVP)** : composant **`GlobalSearchPalette`** + **7 tests Vitest** ; paramètre **`/app/drive?q=`** ; titre Drive racine en **`sr-only`**.

---

*Fichier créé pour centraliser le backlog racine ; le détail sync reste dans **docs/produit/SYNC-BACKLOG.md**.*
