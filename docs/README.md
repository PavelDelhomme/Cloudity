# Documentation Cloudity (`docs/`)

Ce dossier regroupe la **documentation produit**, les **tests** (référence), le **plan long terme**, et des **guides thématiques**. À la **racine du dépôt** : **[README.md](../README.md)** (entrée), **[STATUS.md](../STATUS.md)** (suivi quotidien — **continuer à suivre STATUS** pour l’avancement et la checklist § 0b monorepo), **[BACKLOG.md](../BACKLOG.md)** (priorités et cases à cocher condensées).

## Fichiers principaux (dans `docs/`)

| Fichier | Rôle |
|---------|------|
| **[VISION-SUITE.md](./VISION-SUITE.md)** | Ordre produit long terme (couches P0–P7, décisions, phases A–F), lien avec **PERFORMANCES** / **STATUS** — sans remplacer BACKLOG ni TODO |
| **[ROADMAP.md](./ROADMAP.md)** | Fiches par application + transversal (sécurité, infra, API, monorepo) ; template nouvelle app |
| **[MOBILES.md](./MOBILES.md)** | §0 **web puis mobile** ; matrice web vs mobile par produit ; admin mobile (ADM-02) |
| **[TESTS.md](./TESTS.md)** | Commandes `make test` / E2E / Playwright, couverture, liste des tests à ajouter |
| **[../BACKLOG.md](../BACKLOG.md)** (racine) | Backlog actionnable : priorités, liens vers SYNC-BACKLOG / ROADMAP / TESTS |
| **[PlanImplementation.md](./PlanImplementation.md)** | Phases long terme, métriques, ressources |
| **[PLAN.md](./PLAN.md)** | Dépannage **dev** : console navigateur (Mail, Vite), favicons, dates corbeille, liens vers backlog |
| **[MAIL-GMAIL-OAUTH.md](./MAIL-GMAIL-OAUTH.md)** | Configurer OAuth Google (Gmail « en un clic ») côté hébergeur |
| **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** | Sync Mail/Drive/Calendar/…, `make run-mobile`, session longue, archivage mail serveur |
| **[SECURITE.md](./SECURITE.md)** | Vision Google + Proton, phases, signatures requêtes, Zero Trust, WAF, **post-quantique** (§ 8) ; complète SECURITE-DONNEES |
| **[REVERSE-PROXY.md](./REVERSE-PROXY.md)** | Edge prod : gabarits **Caddy / nginx / Traefik** (TLS 1.3 strict, HSTS, CSP, hybride **`X25519MLKEM768`**) |
| **[MTLS-INTERNE.md](./MTLS-INTERNE.md)** | mTLS entre microservices avec **step-ca**, patterns Go, plan de migration `off → permissive → strict` |
| **[PASS-CRYPTO.md](./PASS-CRYPTO.md)** | Format de chiffrement du **Vault Pass** (Argon2id + XChaCha20-Poly1305 + KEM hybride **X25519 ⊕ ML-KEM-768**) |
| **[PHOTOS.md](./PHOTOS.md)** | Produit Photos (type Google Photos), API timeline, web, mobile, batterie |
| **[BRANCHES.md](./BRANCHES.md)** | Flux Git : `main`, `dev`, `feat/*` — quelle branche pour quelle fonctionnalité |
| **[PERFORMANCES.md](./PERFORMANCES.md)** | Stack actuelle, diagnostic, leviers perf / alternatives, artefacts `Trace-*` / `profiling-data*` |
| **[DEVELOPMENT-HOST.md](./DEVELOPMENT-HOST.md)** | Hôte Linux : Redis `vm.overcommit_memory`, sysctl — pas configurable dans le conteneur seul |
| **[DEV-VERIFICATION.md](./DEV-VERIFICATION.md)** | Checklist après modifs (build, tests, E2E, `/4dm1n`, Docker) |

**Mobile** : `make run-mobile APP=Admin` (ou `APP=Mail`, etc. — voir message script si pas encore scaffold) ; détail [MOBILES.md](./MOBILES.md) § 5.

## Guides thématiques (dans `docs/`)

| Fichier | Contenu |
|---------|---------|
| **[editeur-docs.md](./editeur-docs.md)** | Éditeur de documents maison (Drive / Office) |
| **[ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)** | Mono-SPA → multi-apps ; lien STATUS § 0b, ROADMAP TR-05 |
| **[FRONTEND-LAYOUT.md](./FRONTEND-LAYOUT.md)** | Arborescence **`src/pages/`** (`public`, `auth`, `admin`, `app/<domaine>/`) — cloudity-web |
| **[EVOLUTION-PLATEFORME.md](./EVOLUTION-PLATEFORME.md)** | Nouveau microservice, migrations, `make up` |
| **[BACKEND-LAYOUT.md](./BACKEND-LAYOUT.md)** | Nommage `*-service`, `passwords-service`, `internalsec` (lib), structure Go cible, note `dbpin` / Docker |
| **[MULTI-REPO-LAYOUT.md](./MULTI-REPO-LAYOUT.md)** | Plan : éclatement monorepo → repos GitHub indépendants + meta-repo ; libs partagées versionnées ; production Portainer + nginx-proxy-manager ; tests par niveau |
| **[MULTI-REPO-QUESTIONNAIRE.md](./MULTI-REPO-QUESTIONNAIRE.md)** | QCM + synthèse une ligne + texte libre court (5 lignes) pour trancher avant Phase 0 — voir **MULTI-REPO-LAYOUT.md** § 10 |
| **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** | Chiffrement, durcissement HTTP ; complète ROADMAP TR-01 — voir aussi **[SECURITE.md](./SECURITE.md)** (vision longue) |
| **[TODO.md](./TODO.md)** | Notes de développement (perf Drive, HMR) — priorités produit : ROADMAP / STATUS |

## Convention

- **Ne pas recréer** de copies de ROADMAP / TESTS à la racine : une seule source ici ; le **backlog condensé** vit dans **[../BACKLOG.md](../BACKLOG.md)**.
- Toute **nouvelle app** ou grand chantier : une entrée dans **[ROADMAP.md](./ROADMAP.md)** + mise à jour de **[STATUS.md](../STATUS.md)** et une ligne dans **[../BACKLOG.md](../BACKLOG.md)** quand c’est livré ou en cours.

---

*Index mis à jour : 2026-04-30 — **VISION-SUITE.md** (ordre produit & alignement dépôt) ; **PERFORMANCES.md** (diagnostic, stack, leviers). La racine du repo garde **README.md**, **STATUS.md** et **BACKLOG.md** comme `.md` d’entrée / suivi / backlog.*
