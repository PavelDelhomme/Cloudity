# Documentation Cloudity (`docs/`)

Ce dossier regroupe la **documentation produit**, les **tests** (référence), le **plan long terme**, et des **guides thématiques**. À la **racine du dépôt** ne restent que **[README.md](../README.md)** (entrée du repo) et **[STATUS.md](../STATUS.md)** (suivi quotidien — **continuer à suivre STATUS** pour l’avancement et la checklist § 0b monorepo).

## Fichiers principaux (dans `docs/`)

| Fichier | Rôle |
|---------|------|
| **[ROADMAP.md](./ROADMAP.md)** | Fiches par application + transversal (sécurité, infra, API, monorepo) ; template nouvelle app |
| **[MOBILES.md](./MOBILES.md)** | Web vs mobile par produit, admin mobile (ADM-02) |
| **[TESTS.md](./TESTS.md)** | Commandes `make test` / E2E / Playwright, couverture, liste des tests à ajouter |
| **[PlanImplementation.md](./PlanImplementation.md)** | Phases long terme, métriques, ressources |
| **[MAIL-GMAIL-OAUTH.md](./MAIL-GMAIL-OAUTH.md)** | Configurer OAuth Google (Gmail « en un clic ») côté hébergeur |
| **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** | Sync Mail/Drive/Calendar/…, `make run-mobile`, session longue, archivage mail serveur |

**Mobile** : `make run-mobile APP=Admin` (ou `APP=Mail`, etc. — voir message script si pas encore scaffold) ; détail [MOBILES.md](./MOBILES.md) § 5.

## Guides thématiques (dans `docs/`)

| Fichier | Contenu |
|---------|---------|
| **[editeur-docs.md](./editeur-docs.md)** | Éditeur de documents maison (Drive / Office) |
| **[ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)** | Mono-SPA → multi-apps ; lien STATUS § 0b, ROADMAP TR-05 |
| **[EVOLUTION-PLATEFORME.md](./EVOLUTION-PLATEFORME.md)** | Nouveau microservice, migrations, `make up` |
| **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** | Chiffrement, durcissement ; complète ROADMAP TR-01 |
| **[TODO.md](./TODO.md)** | Notes de développement (perf Drive, HMR) — priorités produit : ROADMAP / STATUS |

## Convention

- **Ne pas recréer** de copies de ROADMAP / TESTS à la racine : une seule source ici.
- Toute **nouvelle app** ou grand chantier : une entrée dans **[ROADMAP.md](./ROADMAP.md)** + mise à jour de **[STATUS.md](../STATUS.md)** quand c’est livré ou en cours.

---

*Index mis à jour : 2026-04-13 (+ SYNC-BACKLOG). La racine du repo ne garde que **README.md** et **STATUS.md** comme `.md` d’entrée / suivi.*
