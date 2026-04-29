# Documentation Cloudity (`docs/`)

Ce dossier regroupe la **documentation produit**, les **tests** (référence), le **plan long terme**, et des **guides thématiques**. À la **racine du dépôt** : **[README.md](../README.md)** (entrée), **[STATUS.md](../STATUS.md)** (suivi quotidien — **continuer à suivre STATUS** pour l’avancement et la checklist § 0b monorepo), **[BACKLOG.md](../BACKLOG.md)** (priorités et cases à cocher condensées).

## Fichiers principaux (dans `docs/`)

| Fichier | Rôle |
|---------|------|
| **[ROADMAP.md](./ROADMAP.md)** | Fiches par application + transversal (sécurité, infra, API, monorepo) ; template nouvelle app |
| **[MOBILES.md](./MOBILES.md)** | §0 **web puis mobile** ; matrice web vs mobile par produit ; admin mobile (ADM-02) |
| **[TESTS.md](./TESTS.md)** | Commandes `make test` / E2E / Playwright, couverture, liste des tests à ajouter |
| **[../BACKLOG.md](../BACKLOG.md)** (racine) | Backlog actionnable : priorités, liens vers SYNC-BACKLOG / ROADMAP / TESTS |
| **[PlanImplementation.md](./PlanImplementation.md)** | Phases long terme, métriques, ressources |
| **[PLAN.md](./PLAN.md)** | Dépannage **dev** : console navigateur (Mail, Vite), favicons, dates corbeille, liens vers backlog |
| **[MAIL-GMAIL-OAUTH.md](./MAIL-GMAIL-OAUTH.md)** | Configurer OAuth Google (Gmail « en un clic ») côté hébergeur |
| **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** | Sync Mail/Drive/Calendar/…, `make run-mobile`, session longue, archivage mail serveur |
| **[SECURITE.md](./SECURITE.md)** | Vision Google + Proton, phases, signatures requêtes, Zero Trust, WAF ; complète SECURITE-DONNEES |
| **[PHOTOS.md](./PHOTOS.md)** | Produit Photos (type Google Photos), API timeline, web, mobile, batterie |
| **[BRANCHES.md](./BRANCHES.md)** | Flux Git : `main`, `dev`, `feat/*` — quelle branche pour quelle fonctionnalité |
| **[PERFORMANCES.md](./PERFORMANCES.md)** | Stack actuelle, diagnostic, leviers perf / alternatives, artefacts `Trace-*` / `profiling-data*` |

**Mobile** : `make run-mobile APP=Admin` (ou `APP=Mail`, etc. — voir message script si pas encore scaffold) ; détail [MOBILES.md](./MOBILES.md) § 5.

## Guides thématiques (dans `docs/`)

| Fichier | Contenu |
|---------|---------|
| **[editeur-docs.md](./editeur-docs.md)** | Éditeur de documents maison (Drive / Office) |
| **[ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)** | Mono-SPA → multi-apps ; lien STATUS § 0b, ROADMAP TR-05 |
| **[EVOLUTION-PLATEFORME.md](./EVOLUTION-PLATEFORME.md)** | Nouveau microservice, migrations, `make up` |
| **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** | Chiffrement, durcissement HTTP ; complète ROADMAP TR-01 — voir aussi **[SECURITE.md](./SECURITE.md)** (vision longue) |
| **[TODO.md](./TODO.md)** | Notes de développement (perf Drive, HMR) — priorités produit : ROADMAP / STATUS |

## Convention

- **Ne pas recréer** de copies de ROADMAP / TESTS à la racine : une seule source ici ; le **backlog condensé** vit dans **[../BACKLOG.md](../BACKLOG.md)**.
- Toute **nouvelle app** ou grand chantier : une entrée dans **[ROADMAP.md](./ROADMAP.md)** + mise à jour de **[STATUS.md](../STATUS.md)** et une ligne dans **[../BACKLOG.md](../BACKLOG.md)** quand c’est livré ou en cours.

---

*Index mis à jour : 2026-04-11 — **PERFORMANCES.md** (diagnostic, stack, leviers d’optimisation, explication des exports Profiler / Chrome Trace). La racine du repo garde **README.md**, **STATUS.md** et **BACKLOG.md** comme `.md` d’entrée / suivi / backlog.*
