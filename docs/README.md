# Documentation Cloudity (`docs/`)

Ce dossier contient toute la **documentation interne** structurée en 5 sous-dossiers thématiques. À la **racine du dépôt**, ne reste que ce qui se lit **au quotidien** :

| Fichier racine | Quand le lire |
|----------------|---------------|
| **[../README.md](../README.md)** | Première arrivée sur le projet (URLs, `make up`, conventions). |
| **[../TODOS.md](../TODOS.md)** | **Checklist du jour** — § **MAINTENANT** (à lire en premier chaque session). |
| **[../STATUS.md](../STATUS.md)** | État global, tableaux détaillés Drive/Mail ; renvoie vers **TODOS.md** § MAINTENANT. |
| **[../BACKLOG.md](../BACKLOG.md)** | Cases produit à cocher quand tu codes (**MAIL-ALIAS-01**, **MP-06**, …). |

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
| **[architecture/SERVICES.md](architecture/SERVICES.md)** | **Référence des conteneurs** : tableau de chaque service Docker (rôle, port host, profil) — explique notamment `cloudity-adminer` / `cloudity-redis-commander` (UI Web Postgres / Redis, **dev only**). |
| **[architecture/ANTI-SPAM-ET-ABUS.md](architecture/ANTI-SPAM-ET-ABUS.md)** | **Anti-spam / anti-abus** : couches L0–L4 (edge, **api-gateway**, auth, MTA **Rspamd**), séparation HTTP vs SMTP, phasage AS-0..AS-5, options ML (River, Redis Streams, MLflow) **après** Mail Core. |
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
| **[securite/MENACES-IA-ET-DEFENSE.md](securite/MENACES-IA-ET-DEFENSE.md)** | Menaces **IA offensive** (spear phishing, fuzzing, exfil) + défense augmentée + **PQC** — planification (plus tard). |
| **[securite/REVERSE-PROXY.md](securite/REVERSE-PROXY.md)** | Edge prod : gabarits **Caddy / nginx / Traefik** (TLS 1.3 strict, HSTS, CSP, hybride `X25519MLKEM768`). |
| **[securite/PASS-CRYPTO.md](securite/PASS-CRYPTO.md)** | Format de chiffrement **Vault Pass** (Argon2id + XChaCha20-Poly1305 + KEM hybride X25519 ⊕ ML-KEM-768). |
| **[securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)** | **Mail** : secrets boîte (AES-GCM) vs corps E2E (futur) vs **Pass** ; anti-spam sans bloquer l’envoi légitime ; liens vers l’architecture multi-couches. |

## produit

| Fichier | Rôle |
|---------|------|
| **[produit/VISION-SUITE.md](produit/VISION-SUITE.md)** | Ordre produit long terme (couches P0–P7, phases A–F). |
| **[produit/ROADMAP.md](produit/ROADMAP.md)** | Fiches par application + transversal (sécurité, infra, API, monorepo) ; template nouvelle app. |
| **[produit/SPRINT-PASS-2026-05.md](produit/SPRINT-PASS-2026-05.md)** | **Sprint urgence Pass** (~20 mai 2026) : état des lieux, L1/L2/L3, gel scission multi-repo, jalons migration Proton Pass. |
| **[produit/MAIL-ALIAS-VISION.md](produit/MAIL-ALIAS-VISION.md)** | Cible **Pass → alias@alias.domain.ovh → Mail** (sans catch-all). |
| **[produit/MAIL-ALIAS-DEMARRAGE.md](produit/MAIL-ALIAS-DEMARRAGE.md)** | **Par où commencer** si OVH / MX pas encore configurés. |
| **[produit/MAIL-ALIAS-MTA.md](produit/MAIL-ALIAS-MTA.md)** | MTA alias auto-hébergé : `.env`, admin Domaines, stack séparée, DNS. |
| **[produit/MOBILES.md](produit/MOBILES.md)** | §0 *web puis mobile* ; matrice web vs mobile par produit ; admin mobile (ADM-02). |
| **[produit/MULTI-PLATEFORME.md](produit/MULTI-PLATEFORME.md)** | **Matrice transversale** : web + mobile + desktop Linux + extension navigateur par app ; état réel (✅ / 🟡 / ❌) ; plan MP-01..MP-08. |
| **[produit/PHOTOS.md](produit/PHOTOS.md)** | Produit Photos (type Google Photos), API timeline, web, mobile, batterie. |
| **[produit/SYNC-BACKLOG.md](produit/SYNC-BACKLOG.md)** | Sync Mail/Drive/Calendar/…, `make run-mobile`, session longue, archivage mail serveur. |
| **[produit/PlanImplementation.md](produit/PlanImplementation.md)** | Phases long terme, métriques, ressources. |
| **[produit/MAIL-GMAIL-OAUTH.md](produit/MAIL-GMAIL-OAUTH.md)** | Configurer OAuth Google (Gmail « en un clic ») côté hébergeur. |
| **[produit/editeur-docs.md](produit/editeur-docs.md)** | Éditeur de documents maison (Drive / Office). |
| **[produit/README.md](produit/README.md)** | Index des fiches produit + alignement chantier actuel. |

## operations

| Fichier | Rôle |
|---------|------|
| **[operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md)** | **★ Guide maître** : PC local → mobile LAN → prod Portainer/NPM (checklists complètes). |
| **[GIT.md](GIT.md)** | **Référence Git unique** : branches, flux, commandes (complète [operations/BRANCHES.md](operations/BRANCHES.md)). |
| **[INSTRUCTIONS-IA.md](../INSTRUCTIONS-IA.md)** | **Checklist avant / après travail** (assistant ou humain) + exception `NPNLD` pour le journal. |
| **[LOGS.md](../LOGS.md)** | **Journal cumulatif** des tours de travail (actions résumées). |
| **[operations/TESTS.md](operations/TESTS.md)** | Commandes `make test` / E2E / Playwright, couverture, tests à ajouter. |
| **[operations/PORTS-HOTES.md](operations/PORTS-HOTES.md)** | **Ports hôte** (`.env` + `docker-compose`) ; Adminer / Redis Commander ; `make up-lean`. |
| **[operations/PERFORMANCES.md](operations/PERFORMANCES.md)** | Stack actuelle, diagnostic, leviers perf, artefacts `Trace-*` / `profiling-data*`. |
| **[operations/PERFORMANCES-MONITORING.md](operations/PERFORMANCES-MONITORING.md)** | **Surveillance CLI temps réel** + **rituel checkpoint perf** (snapshot avant/après feature) : 4 scripts `scripts/dev/perf-*.sh` (`watch`, `snapshot`, `diff`, `budgets`) + cibles Makefile + format JSON + budgets configurables. |
| **[operations/STATUS-JOURNAL-ARCHIVE.md](operations/STATUS-JOURNAL-ARCHIVE.md)** | **Journal STATUS archivé** (2026-05-12 → 2026-05-15) : sprint Pass J1–J7, infra — le fichier racine **`STATUS.md`** ne garde qu’**une** date + *À faire maintenant*. |
| **[operations/PLAN.md](operations/PLAN.md)** | Dépannage **dev** : console navigateur, favicons, dates corbeille. |
| **[operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md)** | Checklist après modifs (build, tests, E2E, `/4dm1n`, Docker). |
| **[operations/DEVELOPMENT-HOST.md](operations/DEVELOPMENT-HOST.md)** | Hôte Linux : Redis `vm.overcommit_memory`, sysctl — pas configurable dans le conteneur. |
| **[operations/RELEASE-AND-DISTRIBUTION.md](operations/RELEASE-AND-DISTRIBUTION.md)** | **Prod partielle** : maj par service (GHCR + Portainer), **Portainer CE**, **OTA Android** (`version.json` + APK), limites **iOS** ; Pass + **alias mail** ; secrets ; liens **REL-*** dans **BACKLOG**. |
| **[operations/DEPLOIEMENT-SUIVI.md](operations/DEPLOIEMENT-SUIVI.md)** | **Feuille de route** : phases A–F, cases ☐, dev/preprod/prod, CI, Android. |
| **[operations/DEPLOIEMENT-ENVIRONNEMENTS.md](operations/DEPLOIEMENT-ENVIRONNEMENTS.md)** | **Hub déploiement** : local vs VPS, socle obligatoire, mobile, Portainer CE. |
| **[operations/DEPLOIEMENT-PAR-SERVICE.md](operations/DEPLOIEMENT-PAR-SERVICE.md)** | **`make deploy-web`**, **`deploy-mail`**, … — tableau local ↔ Portainer. |
| **[operations/PORTAINER-VPS.md](operations/PORTAINER-VPS.md)** | Ton VPS (IP dans Portainer), DNS `cloudity.<domaine-principal>`, réseaux NPM. |
| **[operations/ENV-GENERATION.md](operations/ENV-GENERATION.md)** | **`.env`** : `make secrets`, clés mail/alias, Portainer, état du chiffrement. |
| **[operations/PILOTAGE.md](operations/PILOTAGE.md)** | **Board suivi projet** `/4dm1n/pilotage` (style JobbingTrack : valider / enchaîner). |
| **[operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** | **Prod plus tard** : VPS + **Portainer** + **NPM** ; **Q23** `cloudity.<DOMAIN>` + `api` / `admin` ; **§ 1 bis** DNS registrar + NPM ; **§ 1 ter** chemins `/app/…` vs sous-domaines ; **§ 4 bis** multi-ponts ; Q15 homelab ; **§ 10 bis** rollback. |
| **[operations/BRANCHES.md](operations/BRANCHES.md)** | Tableau « quelle branche pour quoi » + `make feature-finish` — détail dans [GIT.md](GIT.md). |
| **[operations/TODO.md](operations/TODO.md)** | Notes techniques / perf / historique Mail — **pas** la checklist sprint (voir **`TODOS.md`** § MAINTENANT). |

## decisions

> **C’est ici que tu déposes tes réponses** quand je te pose une question structurée.

| Fichier | Rôle |
|---------|------|
| **[decisions/multi-repo/TRAVAIL-MONOREPO-MAINTENANT.md](decisions/multi-repo/TRAVAIL-MONOREPO-MAINTENANT.md)** | Monorepo sur le disque **maintenant** ; deploy par image ; split Git plus tard. |
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

*Index mis à jour : 2026-05-16 — **DEV-VERIFICATION § 0** checklist avant reprise ; fix **totp** SubtleCrypto ; lien **STATUS** § 0 tableau.*
