# CLOUDITY — Backlog produit & technique

**Rôle** : liste **actionnable** des prochaines livraisons et dettes connues. Pour le détail sync / mobile / session / archivage mail, voir **[docs/SYNC-BACKLOG.md](./docs/SYNC-BACKLOG.md)**. Pour les fiches par application (**APP-01** … **TR-07**), voir **[docs/ROADMAP.md](./docs/ROADMAP.md)**. **Sécurité & confiance (vision, phases, Zero Trust, signatures, WAF)** : **[docs/SECURITE.md](./docs/SECURITE.md)**. **Suivi quotidien** : **[STATUS.md](./STATUS.md)**. **Tests** : **[docs/TESTS.md](./docs/TESTS.md)**.

**Convention** : cocher ici ou dans **TESTS.md** §4 quand une ligne est livrée ; garder **STATUS.md** à jour (date + § pertinents).

---

## Démarrage rapide (ordre recommandé)

| Étape | Action |
|-------|--------|
| 0 | *(Optionnel mais recommandé)* Lire **[docs/SECURITE.md](./docs/SECURITE.md)** pour le cadre *Google + Proton* et les phases |
| 1 | **`make setup`** (ou `./scripts/setup.sh`) si première machine |
| 2 | **`make up`** ou **`make up-full`** (seed démo : **admin@cloudity.local** / **Admin123!**) |
| 2b | Quand de nouveaux **`infrastructure/postgresql/migrations/*.sql`** apparaissent (sync du dépôt ou branche) : **`make migrate`** ou **`make rebuild`** — **TESTS.md** (Migrations) |
| 3 | Attendre **20–30 s** puis ouvrir http://localhost:6001 |
| 4 | **`make test`** (Docker requis) avant tout merge |
| 5 | E2E navigateur : **`make seed-admin`** puis **`make test-e2e-playwright`** |

**URLs** : app http://localhost:6001 · API gateway http://localhost:6080 · détail **STATUS.md** §0.

---

## Priorités (ordre indicatif — avril 2026)

| # | Sujet | Détail / lien |
|---|--------|----------------|
| 1 | **Photos** | API timeline, galerie web, **mobile/photos**, sync sobre — **docs/PHOTOS.md** |
| 2 | **Mail** | Dossiers IMAP §0b SYNC-BACKLOG (dont **logs** probes / gateway), recherche §9, PJ, archivage §1 |
| 3 | **Pass** | Style Proton, alias — **ROADMAP APP-04** |
| 4 | **Contacts** | Groupes, import/export, lien Mail ↔ fiches |
| 5 | **Recherche** | **Livré (MVP web)** : palette **Ctrl+K**, `?q=` : filtre **client** dans le dossier courant **ou** recherche **API** sur **tout le Drive** si `q` non vide (`GET /drive/nodes/search`) + lien Contacts ; **À faire** : recherche cross-apps (Mail, Pass…) — **TESTS.md** §4.0 |
| 6 | **Architecture front** | Monorepo multi-apps — **STATUS.md** §0b (**A1** workspaces ✅ ; **A2/A3** `cloudityCore.ts` ; **A3.1** Mail dossiers / IMAP+BDD ; **A4–A10**) |
| 7 | **Drive mobile** | MVP **`mobile/drive`** (liste) + tests **`make test-mobile-drive`** ; alignement barre (loupe, notif) — **MOBILES.md** |
| 8 | **Sécurité transverse** | Phases §3 **SECURITE.md** + durcissement **SECURITE-DONNEES.md** ; pas de doublon avec ROADMAP TR-01 |

### Suite « Google + Proton » (rappel)

Ordre **must-have** : sync/versioning/corbeille → partage propre → backup photo → E2EE espaces privés → galerie riche → recherche privée / anti-abus. Détail des **4 couches** et **phases 1–4** : **[docs/SECURITE.md](./docs/SECURITE.md)**.

---

## À faire (extraits — non exhaustif)

### Infra base de données (migrations)

- [ ] **Outil / panneau migrations** : CLI ou service + **admin web** + **admin mobile** — état des migrations, version, garde-fous (pas d’exécution SQL libre sans audit) — **SYNC-BACKLOG §0d**, **PLAN §11**, **TESTS.md**.

### Sécurité & infra (voir **SECURITE.md**)

- [ ] **Phase 1** : versioning Drive + corbeille unifiée (si pas déjà complet côté produit) ; politique **snapshots** à trancher.
- [ ] **Signatures applicatives** : spec canonical request + nonces pour **exports**, **admin critique**, webhooks ; pas sur toute l’API.
- [ ] **Zero Trust incrémental** : scopes JWT par route ; mTLS ou tokens service inter-microservices documentés.
- [ ] **WAF** : eval NGINX + ModSecurity + CRS (mode détection) devant gateway ; tuning faux positifs.
- [ ] **Audit log** utilisateur / admin (actions sensibles) — lié **SECURITE-DONNEES.md** moyen terme.

### UX / Suite web (`frontend/admin-dashboard`)

- [ ] **Mail web — doc & robustesse** : console navigateur (Vite, CSS mail HTML, favicons) et **dates liste corbeille** — voir **`docs/PLAN.md`** ; sync **`date_at`** sans `time.Now()` si enveloppe IMAP sans date (**mail-directory-service**). Alias boîte **MVP** ; système **complet** (expiration, vue globale, DNS) : **SYNC-BACKLOG §2**, **STATUS** Phase 3, **ROADMAP APP-04**.
- [ ] **Mail — règles de tri (type Proton)** : menu **⋯** → création de règle depuis un message ; critères (expéditeur, domaine, sujet, …) ; actions (dossier, lu, étiquette, corbeille) ; option **appliquer aux messages déjà en BDD** (tous dossiers ou périmètre) ; persistance + moteur côté **mail-directory-service** — **STATUS §0b A3.2**, **SYNC-BACKLOG §0b** (règles).
- [ ] Recherche globale **API** cross-apps (Mail, Pass…) — **Drive** : recherche nom sur **tout l’arborescence** via **`GET /drive/nodes/search`** quand **`?q=`** est renseigné dans le dashboard ; navigation **Contacts** inchangée.
- [ ] Hub : recherche cross-apps (alignée ROADMAP).
- [ ] Playwright : scénario ouverture palette recherche + `?q=` sur Drive (optionnel).

### Mobile

- [x] **Drive** Flutter (`mobile/drive`) : liste fichiers — **`make test-mobile-drive`** / suite — **MOBILES.md**.
- [x] **Photos** Flutter : **`make test-mobile-photos`** / suite.
- [x] **Mail** Flutter (`mobile/mail`) : multi-boîtes, dossiers, lu, **PJ téléchargeable / partage**, **envoi minimal** (`POST /mail/me/send`), tests `mail_validation` — **`make test-mobile-mail`** ; à poursuivre : brouillon **serveur**, PJ inline, push — **MOBILES.md** §5.
- [ ] Aligner barre d’app (loupe, notifications) avec le web — rappel dans **GlobalSearchPalette** (texte d’aide UI).

### Backend / infra

- [x] **contacts-service** : **`main_test.go`** (health, 401 sans `X-User-ID`, liste vide si DB absente) — inclus dans **`make test`** / **`make test-docker`** / **govulncheck** (`scripts/test-security.sh`).
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

*Fichier créé pour centraliser le backlog racine ; le détail sync reste dans **docs/SYNC-BACKLOG.md**.*
