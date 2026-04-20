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
| 3 | Attendre **20–30 s** puis ouvrir http://localhost:6001 |
| 4 | **`make test`** (Docker requis) avant tout merge |
| 5 | E2E navigateur : **`make seed-admin`** puis **`make test-e2e-playwright`** |

**URLs** : app http://localhost:6001 · API gateway http://localhost:6080 · détail **STATUS.md** §0.

---

## Priorités (ordre indicatif — avril 2026)

| # | Sujet | Détail / lien |
|---|--------|----------------|
| 1 | **Photos** | API timeline, galerie web, **mobile/photos**, sync sobre — **docs/PHOTOS.md** |
| 2 | **Mail** | Dossiers IMAP §0b SYNC-BACKLOG, recherche §9, PJ, archivage §1 |
| 3 | **Pass** | Style Proton, alias — **ROADMAP APP-04** |
| 4 | **Contacts** | Groupes, import/export, lien Mail ↔ fiches |
| 5 | **Recherche** | **Livré (MVP web)** : palette **Ctrl+K** barre app, `?q=` filtre noms **dossier Drive courant** + lien Contacts ; **À faire** : API recherche arborescente / cross-apps — **TESTS.md** §4.0 |
| 6 | **Architecture front** | Monorepo multi-apps — **STATUS.md** §0b (A1–A10) |
| 7 | **Drive mobile** | Scaffold + même UX barre (loupe, notifications) — **MOBILES.md** |
| 8 | **Sécurité transverse** | Phases §3 **SECURITE.md** + durcissement **SECURITE-DONNEES.md** ; pas de doublon avec ROADMAP TR-01 |

### Suite « Google + Proton » (rappel)

Ordre **must-have** : sync/versioning/corbeille → partage propre → backup photo → E2EE espaces privés → galerie riche → recherche privée / anti-abus. Détail des **4 couches** et **phases 1–4** : **[docs/SECURITE.md](./docs/SECURITE.md)**.

---

## À faire (extraits — non exhaustif)

### Sécurité & infra (voir **SECURITE.md**)

- [ ] **Phase 1** : versioning Drive + corbeille unifiée (si pas déjà complet côté produit) ; politique **snapshots** à trancher.
- [ ] **Signatures applicatives** : spec canonical request + nonces pour **exports**, **admin critique**, webhooks ; pas sur toute l’API.
- [ ] **Zero Trust incrémental** : scopes JWT par route ; mTLS ou tokens service inter-microservices documentés.
- [ ] **WAF** : eval NGINX + ModSecurity + CRS (mode détection) devant gateway ; tuning faux positifs.
- [ ] **Audit log** utilisateur / admin (actions sensibles) — lié **SECURITE-DONNEES.md** moyen terme.

### UX / Suite web (`frontend/admin-dashboard`)

- [ ] Recherche globale **API** (tous dossiers Drive, puis Mail, Pass…) — aujourd’hui filtrage **client** sur la liste courante + navigation **Contacts**.
- [ ] Hub : recherche cross-apps (alignée ROADMAP).
- [ ] Playwright : scénario ouverture palette recherche + `?q=` sur Drive (optionnel).

### Mobile

- [ ] Apps **Drive**, **Mail**, … (hors **Photos** / **Admin**) : scaffolds — **docs/MOBILES.md** §5.
- [ ] Aligner barre d’app (loupe, notifications) avec le web — rappel dans **GlobalSearchPalette** (texte d’aide UI).

### Backend / infra

- [ ] **contacts-service** : tests `go test` dans **Makefile** `make test` quand des `*_test.go` existent.
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
