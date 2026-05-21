# CLOUDITY — Suivi court (micro-tâches)

**Rôle** : cases rapides et liens ; le détail produit reste dans **[BACKLOG.md](./BACKLOG.md)**, le fil quotidien dans **[STATUS.md](./STATUS.md)**.

> **Point d’entrée unique** : Mail alias / Maddy / déploiement est **en pause volontaire** après fusion dans **`dev`** (`04a9c68c`). Ne reprendre cette partie que si l’utilisateur dit explicitement **« on retourne sur la partie mail »**. En attendant : travailler hors Mail/Déploiement sur Photos, mobile, frontend, applications, Pass. Branche active : **`feat/mobile-desktop-validation`**.

---

## MAINTENANT — moteur UI partagé (`@cloudity/ui`)

**Priorité immédiate** — avant corps mail / checklist alias / Maddy VPS.

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **U0** | **Lire la cible** | **[CLOUDITY-UI-DESIGN-SYSTEM.md](./docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md)** + **STATUS.md** § 0b **A4** | ☑ |
| **U1** | **Branche** | `git checkout feat/cloudity-ui-design-system` (depuis `dev` à jour) | ☑ |
| **U2** | **Scaffold package** | `frontend/packages/cloudity-ui` + `package.json` + preset Tailwind + export `Button`, `Card`, `Input`… | ☑ |
| **U3** | **Réexports** | `@cloudity/shared` réexporte depuis `@cloudity/ui` (deprecated) pour ne pas casser les imports | ☑ |
| **U4** | **Première migration** | Pages **admin** `/4dm1n` → imports `@cloudity/ui` | ☑ |
| **U5** | **Tests** | `make test-dashboard` · pas de régression Vitest | ☑ |
| **U6** | **Catalogue** | Storybook minimal **ou** route dev `/4dm1n/dev/ui` (admin only) | ☑ |
| **U7** | **Responsive UI-DS** | Composants `Responsive*` dans `@cloudity/ui` ; Admin `ResponsiveShell` (drawer &lt;lg) ; catalogue `ResponsivePage/Grid` ; Mail pile nav/liste/lecture &lt;lg | ☑ |
| **U8** | **Admin polish opérationnel** | Domaines mail résiste aux réponses `null` ; Dashboard explique le mode cgroup ; Users affiche 2FA/dernière connexion sans faux reset ; CVE priorise les dépendances ; Passkeys/Settings explicitent le périmètre web/mobile/extension | ☑ |
| **U9** | **Admin sécurité 2FA avancée** | À concevoir backend + UI : reset TOTP utilisateur avec step-up admin, audit log, codes de récupération et garde anti-lockout | ☐ |
| **U10** | **CVE enrichies** | Analyse CVE trop pauvre quand OSV renvoie `summary = null` : récupérer/afficher alias, sévérité, impact, affected ranges et remediation/version cible (OSV/GHSA/NVD), avec fallback clair au lieu de `—` | ☐ |

**Branche Git** : `feat/cloudity-ui-design-system` → **fusionnée dans `dev`** (2026-05-20).  
**Case BACKLOG** : **UI-DS-01** — phases **UI-0…UI-8** livrées sur cette branche ; **UI-9** / **UI-10** reportées (2FA admin, CVE enrichies).  
**Branche précédente** : `feat/mail-alias-checklist` → **fusionnée dans `dev`** (2026-05-21, fast-forward `00a0474c`).  
**Branche précédente** : `feat/mail-alias-prod` → **fusionnée dans `dev`** (2026-05-21, fast-forward `0a31874a`).  
**Branche précédente** : `feat/mail-mta-alias-delivery` → **fusionnée dans `dev`** (2026-05-21, fast-forward `04a9c68c` : Maddy `alias-router` + notifications Mail web).  
**Branche active** : `feat/mobile-desktop-validation` (depuis `dev`) — hors Mail : mobile/desktop, Photos, Drive, Pass, frontend.

---

## ENSUITE — mail, alias, déploiement (après U1–U5 minimum)

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **1** | **Santé locale** | `make doctor` · `make migrate` · **`make test`** · gateway OK | ☑ |
| **2** | **Corps mail manquant** | `make deploy-mail` ✅ · test Go MIME `attachment` ✅ · test Vitest **Recharger le message** ✅ · validation manuelle message impôts ✅ (`dumb@delhomme.ovh`, corps IMAP rechargé) | ☑ |
| **3** | **MTA alias auto-hébergé** | Local validé : alias créé, règle auto, `/mail/internal/alias-resolve` OK, on/off OK. Maddy local route maintenant vers `alias-router:2527` (plus de `dummy`) ; port hôte `2526`, alias absent = 550 propre. C7 réel reste livraison IMAP/redirection fournisseur | 🟡 |
| **4** | **Admin Domaines + checklist C1–C7** | C1–C6 ☑ ; C6 couvert par Vitest + Playwright Mail (`from_email` alias actif, alias désactivé exclu) ; C7 🟡 (Maddy local accepte RCPT, livraison IMAP réelle/redirection fournisseur non rejouée) | 🟡 |
| **5** | **J8 Pass / extension** | **MP-06 + MP-07** : autofill réel livré + E2E Chromium extension (`make test-e2e-playwright-pass-extension`) ; prochain : UX popup/liste avancée, icônes, hardening Firefox/Safari | ☑ |
| **5b** | **2FA locale compte démo** | Web + mobile ADB automatisés (`test-mobile-2fa`). Optionnel : scan QR manuel authenticator (hors CI) | ☑ |
| **6** | **DNS + Maddy prod** | **[MAIL-ALIAS-DNS-MADDY.md](./docs/operations/MAIL-ALIAS-DNS-MADDY.md)** · Admin Domaines : bloc DNS copiable · `make test-mail-mta-local` / `make mail-mta-local-up` · MX/SPF/DKIM sur VPS (manuel) | 🟡 |
| **7** | **Registry + Portainer** | GHCR · webhook — **[DEPLOIEMENT-SUIVI.md](./docs/operations/DEPLOIEMENT-SUIVI.md)** § B | ☐ |
| **8** | **Linux / mobile / stores** | **[DISTRIBUTION-LINUX-DESKTOP.md](./docs/operations/DISTRIBUTION-LINUX-DESKTOP.md)** | ☐ |

### Barrière qualité avant reprise Mail alias / déploiement — PAUSE

Ne pas reprendre DNS/Maddy/VPS/C7 tant que l’utilisateur ne dit pas explicitement **« on retourne sur la partie mail »**.

Avant de reprendre les changements DNS/VPS/MTA prod, stabiliser et noter les résultats :

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **Q0** | **Tests Pass extension** | `make test-pass-extension` — domain matcher + build MV3 ; `make test-e2e-playwright-pass-extension` — Chromium extension + autofill MP-07 | ☑ |
| **Q1** | **Unit/app complets** | `make test` — Go, pytest, Vitest Docker | ☑ |
| **Q2** | **Pass ciblé** | `make test-pass` — passwords-service, pass-crypto, import Proton, extension MV3 | ☑ |
| **Q3** | **Lint front** | `make test-dashboard-lint` | ☑ |
| **Q4** | **Sécurité** | `make test-security` ✅ avec warnings : Go toolchain `1.25.9 → 1.25.10`, `golang.org/x/net`, `gosec` (G115 mail UID, timeouts HTTP, chemins fichiers), `gitleaks` faux positifs/test à baseliner, `npm audit` modéré | 🟡 |
| **Q5** | **E2E web** | `make test-e2e` ✅ ; `make test-e2e-playwright` ✅ — 72 passed, 4 skipped après corrections login/passkeys/mail/pass | ☑ |
| **Q6** | **Mobile** | `make test-mobile-suite` ✅ Photos/Drive/Mail hôte ; integration_test device ignorés car aucun appareil ADB détecté | ☑ |
| **Q7** | **Perf** | `make perf-snapshot LABEL=before-mail-alias-prod` ✅ ; `make perf-budgets` 🟡 KO sur `LOADAVG_1M=8.18 > 6.0` après grosse batterie tests, conteneurs OK (`CPU 4.7%`, `MEM 1145 MiB`) | 🟡 |
| **Q8** | **2FA locale fonctionnelle** | Web E2E 5/5 (activation, TOTP, mauvais code, recovery, recovery réutilisé refusé) + mobile ADB 2FA Drive/Mail/Photos avec mauvais code puis TOTP frais (`make test-mobile-2fa`, Samsung `R5CT7263YJL`, gateway LAN) | ☑ |

### 2FA locale — à valider rapidement

Objectif : même en local, le compte de dev doit pouvoir activer la 2FA et prouver que tout Cloudity reste utilisable.

| Étape | Validation attendue | État |
|-------|---------------------|------|
| **2FA-1** | `/app/settings` (ou `/app/settings/canonical`) : activation TOTP, QR, secret manuel, codes de récup (`TwoFactorSection`) | ☑ |
| **2FA-2** | Activer TOTP sur compte dédié `e2e-2fa@cloudity.local` (`make seed-e2e-2fa`), copier les codes, se déconnecter | ☑ (E2E) |
| **2FA-3** | Login web : email + mot de passe → étape code TOTP → accès `/app` | ☑ (E2E) |
| **2FA-4** | Login web avec un code de récupération → accès OK + rappel de régénérer | ☑ (E2E) |
| **2FA-5** | E2E Playwright dédié `e2e/twofa.spec.ts` + `make test-e2e-playwright-twofa` : activation, TOTP, mauvais code, recovery, recovery réutilisé refusé (ne touche pas `admin@cloudity.local`) | ☑ |
| **2FA-6** | Mobile Drive/Mail/Photos : écran 2FA + mauvais code refusé + TOTP frais calculé au moment du test → écran principal (`integration_test/twofa_flow_test.dart`, `make test-mobile-2fa`) | ☑ |

Note : ne pas laisser le compte démo dans un état qui casse les E2E standards. Prévoir une remise à zéro contrôlée ou un utilisateur de test dédié `e2e-2fa@cloudity.local`.

### Git — ne jamais versionner

| Dossier / fichier | Pourquoi |
|-------------------|----------|
| **`frontend/apps/cloudity-web/.vite/`** | Cache Vite — `**/.vite/` dans `.gitignore` |
| **`deploy/mail-mta/.env`** | FQDN / IP réels |
| **`.certs/`** | mkcert local |

**Ne pas** `git add *` — toujours `git status` puis chemins ciblés.

---

## Quel fichier lire pour quoi ?

| Fichier | À quoi il sert | Tu l’ouvres quand… |
|---------|----------------|-------------------|
| **`TODOS.md`** (racine, **ce fichier**) | **Liste du jour** + secrets + déploiement (liens) | **Chaque session** — § MAINTENANT puis § ENSUITE |
| **`STATUS.md`** (racine) | État global, historique, tableaux Drive/Mail détaillés | Contexte large, pas la checklist du jour |
| **`BACKLOG.md`** (racine) | Cases produit (**UI-DS-01**, **MAIL-ALIAS-01**, …) | Tu codes une feature listée |
| **`docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md`** | Vision moteur UI `@cloudity/ui` | Chantier design system |
| **`docs/operations/TODO.md`** | Dépannage Mail/perf **ancien** + liens | Symptôme console / PLAN.md — **pas** la priorité sprint |
| **`docs/LOGS.md`** | Journal des tours **assistant** | Toi : optionnel ; l’IA y écrit après chaque session |
| **`docs/operations/DEPLOIEMENT-SUIVI.md`** | Phases A→F Portainer / CI / Android | **Après** merge `dev`, quand tu publies sur le VPS |

Il n’y a **pas** de `TODO.md` à la racine : seulement **`TODOS.md`** (avec un **S**).

---

## Périmètre obligatoire — état réel (web + mobile + extension)

Source détaillée : **[MULTI-PLATEFORME.md](./docs/produit/MULTI-PLATEFORME.md)** · index `docs/` : **[docs/README.md](./docs/README.md)** (58 fiches).

| Produit | Web | Mobile Android | Extension | Prochaine brique code |
|---------|-----|----------------|-----------|------------------------|
| **UI transverse** | ✅ `@cloudity/ui` sur `dev` | — | — | **UI-3** Pass/Settings utilisateur (BACKLOG) |
| **Mail** | ✅ | ✅ MVP | — | Corps MIME · alias · **MAIL-ALIAS-02** |
| **Drive** | ✅ | ✅ MVP + Linux desktop build validé | — | Polish mobile + gros fichiers |
| **Photos** | ✅ | ✅ + Linux desktop build validé | — | Albums, sync galerie |
| **Pass** | ✅ | ✅ lecture | ✅ MV3 autofill initial + E2E MP-07 | UX popup avancée · Firefox/Safari · édition mobile |
| **Alias mail** | ✅ enregistrement + filtre | (via Mail/Pass) | — | **05** MTA · **06** DKIM |

**Phase 2 alias (MTA)** : domaine alias réel **dans l’UI / `.env` / Portainer** (pas en Git) · réception `*@<domaine-alias>` via **Maddy/Postfix** → lookup Cloudity → livraison boîte IMAP · **Admin Domaines** suit hostname/MX/SPF/DKIM/DMARC attendus · puis **C1–C7**.  
**Préprod** : possible **après** merge `dev` + variables Portainer — pas avant boîte mail + alias testés en local.

---

## Sécurité avancée (plus tard — pas maintenant)

Feuille de route **menaces IA** + **post-quantique** : **[MENACES-IA-ET-DEFENSE.md](./docs/securite/MENACES-IA-ET-DEFENSE.md)** (SEC-IA-*, SEC-PQC-*).  
Court terme en cours : **SECURITE.md**, **MTLS-INTERNE.md**, **ANTI-SPAM-ET-ABUS.md**.

### Où est quoi dans `docs/` ?

| Dossier | Exemples | Lié à ton périmètre |
|---------|----------|---------------------|
| **`docs/produit/`** | ROADMAP, MOBILES, MAIL-ALIAS-*, SPRINT-PASS | Vision + sprint |
| **`docs/architecture/`** | **CLOUDITY-UI-DESIGN-SYSTEM**, SERVICES | UI + infra |
| **`docs/operations/`** | DEPLOIEMENT-SUIVI, TESTS, DEV-VERIFICATION | Local, CI, VPS |
| **`docs/securite/`** | SECRETS, MTLS-INTERNE | Secrets / mTLS |
| **`docs/decisions/`** | QUESTIONNAIRE multi-repo | Plus tard |

---

## Avant session

1. **`git status`** — branche = chantier en cours (**`feat/mail-alias-checklist`** pour mail/alias).
2. **`docker info`** puis **`make test`** — **[docs/operations/DEV-VERIFICATION.md](./docs/operations/DEV-VERIFICATION.md)** § 0.
3. Relire **§ ENSUITE** #3–#4 de ce fichier.

---

## `.env` / secrets (alignement `.env.example`)

| Besoin | Commande |
|--------|----------|
| Nouveau fichier `.env` complet (CSPRNG) | **`make secrets`** |
| Clé IMAP/SMTP | **`make ensure-mail-encryption-key`** |
| Stack mail + extension | **`make doctor`** |
| Sync IMAP après rotation de clé | Ré-enregistrer le MDP boîte dans l’UI Mail |

Référence : **[ENV-GENERATION.md](./docs/operations/ENV-GENERATION.md)** · **[SECRETS.md](./docs/securite/SECRETS.md)**

**À faire avant VPS/prod mail** : régénérer les secrets partagés visibles/utilisés en local pendant la mise au point (`MTA_INTERNAL_TOKEN`, clés alias/mail si elles ont été exposées dans des échanges ou terminaux), puis reporter uniquement les nouvelles valeurs dans `.env` / Portainer — jamais dans Git.

---

## Alias mail — cible produit (Pass ↔ Mail)

**Doc maître** : **[MAIL-ALIAS-VISION.md](./docs/produit/MAIL-ALIAS-VISION.md)** · pratique : **[MAIL-ALIAS-DEMARRAGE.md](./docs/produit/MAIL-ALIAS-DEMARRAGE.md)**.

| Priorité | Tâche | État |
|----------|--------|------|
| P0 | Enregistrement Cloudity ≠ création MX/OVH | Doc ✅ |
| P1 | **MAIL-ALIAS-01** — activer/désactiver alias | ✅ |
| P1 | **MAIL-ALIAS-02** — règle auto par alias | ✅ |
| P1 | **Phase 2 MTA** — réception alias auto-hébergée (local puis VPS) | EN COURS |
| P2 | **MAIL-ALIAS-05** — MTA / Maddy | BACKLOG · après UI + corps mail |
| P2 | **MAIL-ALIAS-06** — DKIM / SPF | BACKLOG |

---

## Feuille de route déploiement (méthodique)

**Document détaillé** : **[DEPLOIEMENT-SUIVI.md](./docs/operations/DEPLOIEMENT-SUIVI.md)**

| Phase | Objectif | Lien rapide |
|-------|----------|-------------|
| **A** | Local monorepo | SUIVI § 2 |
| **B** | Git → GHCR → Portainer | SUIVI § 3 |
| **C** | Stacks Cloudity vs Maddy | **[PORTAINER-MAIL-ALIAS.md](./docs/operations/PORTAINER-MAIL-ALIAS.md)** |
| **D** | NPM + DNS + HTTPS (web) | SUIVI § 5 |
| **E** | Android APK + `version.json` | **[RELEASE-AND-DISTRIBUTION.md](./docs/operations/RELEASE-AND-DISTRIBUTION.md)** |
| **F** | Mise à jour un service | `make deploy-web`, `deploy-mail` |
| **G** | Linux desktop (.deb, Flatpak, Snap) | **[DISTRIBUTION-LINUX-DESKTOP.md](./docs/operations/DISTRIBUTION-LINUX-DESKTOP.md)** |

### Registry Docker → Portainer

| Étape | Action |
|-------|--------|
| 1 | GHA **`docker-publish.yml`** → **GHCR** |
| 2 | Stack Portainer : `image:` + `TAG` |
| 3 | Webhook redeploy ou Watchtower |
| 4 | Smoke `/health` + login |

**Prochaine action** : § ENSUITE #3–#4 — configurer le suffixe alias dans l’UI, créer la redirection fournisseur, valider réception + filtre.

---

## Déploiement (références rapides)

| Besoin | Doc / commande |
|--------|----------------|
| Hub 3 environnements | **[DEPLOIEMENT-ENVIRONNEMENTS.md](./docs/operations/DEPLOIEMENT-ENVIRONNEMENTS.md)** |
| Front / Mail / API seul | `make deploy-web` · `deploy-mail` · `deploy-gateway` |
| Compose Portainer | **[deploy/portainer/README.md](./deploy/portainer/README.md)** |

## Prod VPS (sécurité)

**[DEPLOIEMENT-VPS-PORTAINER-NPM.md](./docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** + **[HOMELAB-SECURITE.md](./docs/architecture/HOMELAB-SECURITE.md)** (Q15).

---

## URL-CAPABILITIES (post J7 bis)

Voir **[docs/securite/URL-CAPABILITIES.md](./docs/securite/URL-CAPABILITIES.md)** et **[BACKLOG.md](./BACKLOG.md)** (section UC-DOC / UC-FE).
