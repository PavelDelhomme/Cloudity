# Documentation Cloudity (`docs/`)

Ce dossier contient toute la **documentation interne** structurée en 5 sous-dossiers thématiques. À la **racine du dépôt**, ne reste que ce qui se lit **au quotidien** :

| Fichier racine | Quand le lire |
|----------------|---------------|
| **[../README.md](../README.md)** | Première arrivée sur le projet (URLs, `make up`, conventions). |
| **[../STATUS.md](../STATUS.md)** | **Suivi quotidien** — état réel des chantiers, § 0b checklist monorepo, dates. |
| **[../BACKLOG.md](../BACKLOG.md)** | Priorités actives + cases à cocher (sprint en cours). |

Tout le reste vit ici, dans des **sous-dossiers thématiques** :

| Sous-dossier | Pour quoi faire |
|--------------|-----------------|
| **[architecture/](#architecture)** | Comment le projet est **assemblé** — structure backend/frontend, multi-repos, évolution. |
| **[securite/](#securite)** | **Sécurité** : vision Google+Proton, chiffrement Pass, mTLS, edge TLS, audit admin. |
| **[produit/](#produit)** | **Produit** : roadmap, vision suite, fiches par app (Mail, Photos…), mobile, sync. |
| **[operations/](#operations)** | **Dev / tests / perf** : commandes `make`, perf, troubleshooting, branches Git. |
| **[decisions/](#decisions)** | **Décisions ouvertes** : questionnaires + tes **réponses** (point d’entrée pour me dire « voici mes choix »). |

---

## architecture

| Fichier | Rôle |
|---------|------|
| **[architecture/ARCHITECTURE-FRONTENDS.md](architecture/ARCHITECTURE-FRONTENDS.md)** | Mono-SPA → multi-apps ; lien STATUS § 0b, ROADMAP TR-05. |
| **[architecture/FRONTEND-LAYOUT.md](architecture/FRONTEND-LAYOUT.md)** | Arborescence `src/pages/` (`public`, `auth`, `admin`, `app/<domaine>/`) — `cloudity-web`. |
| **[architecture/BACKEND-LAYOUT.md](architecture/BACKEND-LAYOUT.md)** | Nommage `*-service`, rôle `internalsec`, structure Go cible, note `dbpin` / Docker. |
| **[architecture/MULTI-REPO-LAYOUT.md](architecture/MULTI-REPO-LAYOUT.md)** | Plan d’éclatement **monorepo → repos GitHub indépendants** + meta-repo ; production Portainer + NPM ; tests par niveau. |
| **[architecture/EVOLUTION-PLATEFORME.md](architecture/EVOLUTION-PLATEFORME.md)** | Étapes pour ajouter un microservice / migration / `make up`. |

## securite

| Fichier | Rôle |
|---------|------|
| **[securite/SECURITE.md](securite/SECURITE.md)** | Vision Google + Proton, phases, signatures requêtes, Zero Trust, WAF, post-quantique (§ 8). |
| **[securite/SECURITE-DONNEES.md](securite/SECURITE-DONNEES.md)** | Chiffrement au repos, durcissement HTTP ; complète ROADMAP TR-01. |
| **[securite/AUDIT-SECURITE.md](securite/AUDIT-SECURITE.md)** | Audit sécurité **transverse** (admin UI `/4dm1n`, gateway `/admin/*`, mail admin-only, interne Docker, JWT UX). |
| **[securite/SECRETS.md](securite/SECRETS.md)** | **Politique secrets** : inventaire, génération `make secrets`, rotation, détection (`gitleaks`), procédure incident. |
| **[securite/MTLS-INTERNE.md](securite/MTLS-INTERNE.md)** | mTLS entre microservices avec **step-ca**, patterns Go, migration `off → permissive → strict`. |
| **[securite/REVERSE-PROXY.md](securite/REVERSE-PROXY.md)** | Edge prod : gabarits **Caddy / nginx / Traefik** (TLS 1.3 strict, HSTS, CSP, hybride `X25519MLKEM768`). |
| **[securite/PASS-CRYPTO.md](securite/PASS-CRYPTO.md)** | Format de chiffrement **Vault Pass** (Argon2id + XChaCha20-Poly1305 + KEM hybride X25519 ⊕ ML-KEM-768). |

## produit

| Fichier | Rôle |
|---------|------|
| **[produit/VISION-SUITE.md](produit/VISION-SUITE.md)** | Ordre produit long terme (couches P0–P7, phases A–F). |
| **[produit/ROADMAP.md](produit/ROADMAP.md)** | Fiches par application + transversal (sécurité, infra, API, monorepo) ; template nouvelle app. |
| **[produit/MOBILES.md](produit/MOBILES.md)** | §0 *web puis mobile* ; matrice web vs mobile par produit ; admin mobile (ADM-02). |
| **[produit/PHOTOS.md](produit/PHOTOS.md)** | Produit Photos (type Google Photos), API timeline, web, mobile, batterie. |
| **[produit/SYNC-BACKLOG.md](produit/SYNC-BACKLOG.md)** | Sync Mail/Drive/Calendar/…, `make run-mobile`, session longue, archivage mail serveur. |
| **[produit/PlanImplementation.md](produit/PlanImplementation.md)** | Phases long terme, métriques, ressources. |
| **[produit/MAIL-GMAIL-OAUTH.md](produit/MAIL-GMAIL-OAUTH.md)** | Configurer OAuth Google (Gmail « en un clic ») côté hébergeur. |
| **[produit/editeur-docs.md](produit/editeur-docs.md)** | Éditeur de documents maison (Drive / Office). |

## operations

| Fichier | Rôle |
|---------|------|
| **[operations/TESTS.md](operations/TESTS.md)** | Commandes `make test` / E2E / Playwright, couverture, tests à ajouter. |
| **[operations/PERFORMANCES.md](operations/PERFORMANCES.md)** | Stack actuelle, diagnostic, leviers perf, artefacts `Trace-*` / `profiling-data*`. |
| **[operations/PLAN.md](operations/PLAN.md)** | Dépannage **dev** : console navigateur, favicons, dates corbeille. |
| **[operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md)** | Checklist après modifs (build, tests, E2E, `/4dm1n`, Docker). |
| **[operations/DEVELOPMENT-HOST.md](operations/DEVELOPMENT-HOST.md)** | Hôte Linux : Redis `vm.overcommit_memory`, sysctl — pas configurable dans le conteneur. |
| **[operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** | **Prod plus tard** : VPS (ex. Contabo), **Portainer** + **NPM** ; ports internes vs dev local ; lien Q15 / homelab. |
| **[operations/BRANCHES.md](operations/BRANCHES.md)** | Flux Git : `main`, `dev`, `feat/*` — quelle branche pour quelle fonctionnalité. |
| **[operations/TODO.md](operations/TODO.md)** | Notes de développement (perf Drive, HMR). Priorités produit : ROADMAP / STATUS. |

## decisions

> **C’est ici que tu déposes tes réponses** quand je te pose une question structurée.

| Fichier | Rôle |
|---------|------|
| **[decisions/multi-repo/QUESTIONNAIRE.md](decisions/multi-repo/QUESTIONNAIRE.md)** | Choix multi-repos GitHub : Q1–Q10 (QCM) + 5 lignes texte libre. |
| **[decisions/multi-repo/REPONSES.md](decisions/multi-repo/REPONSES.md)** | **Tes réponses** (à remplir) — la **synthèse une ligne** déclenche la Phase 0. |

---

## Convention

- **Une seule source** par sujet : pas de copie ROADMAP/TESTS à la racine.
- **Toute nouvelle app / chantier** :
  1. fiche dans **[produit/ROADMAP.md](produit/ROADMAP.md)** ;
  2. mise à jour **[../STATUS.md](../STATUS.md)** ;
  3. ligne dans **[../BACKLOG.md](../BACKLOG.md)** quand c’est en cours / livré.
- **Toute décision** demandée par moi (questionnaire) : tu réponds dans **`docs/decisions/<sujet>/REPONSES.md`**, je continue le travail à partir de là.

*Index mis à jour : 2026-05-12 — ajout `securite/SECRETS.md` (politique secrets, `make secrets`, gitleaks).*
