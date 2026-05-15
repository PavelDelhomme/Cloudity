# Releases, prod partielle, distribution mobile & mises à jour

**Rôle** : cadrer **sans illusion** comment livrer une **première prod utilisable** (Portainer + NPM + HTTPS), mettre à jour **service par service**, et ce qui est **réaliste** pour les **applications mobiles** hors Google Play — en lien avec **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)**, **[HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** (Q15), **[securite/SECRETS.md](../securite/SECRETS.md)** et le **[BACKLOG.md](../../BACKLOG.md)** (GHCR, stacks, **MP-*** / Pass).

---

## 1. Ce que « prod partielle » veut dire ici

| Objectif | Faisable tôt ? | Dépend de |
|----------|------------------|-----------|
| Stack Docker sur VPS + **NPM** + TLS (**Let’s Encrypt**) | Oui, une fois Q15 / décision prise | **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** |
| **Web** + **API** (`cloudity-web`, `api-gateway`, auth, mail-directory…) avec images **taguées** | Oui | **Q24** — bump `TAG=` dans Portainer par stack |
| **Pass web** utilisable au quotidien (remplacer Proton Pass *côté web* en premier) | En cours — sprint J8 puis L2 | **[SPRINT-PASS-2026-05.md](../produit/SPRINT-PASS-2026-05.md)** |
| **Alias mail** créés depuis **Pass** + synchro **Mail** web/mobile | **Périmètre produit** — API déjà documentée côté sync | **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** § **2** ; **BACKLOG** (création alias depuis UI Pass) ; extension **MP-06** |
| **Autofill Pass sur toutes les apps mobiles** (par-dessus Chrome, banque, etc.) | **Android** : service d’**Autofill** (framework) + app déclarée ; **iOS** : **pas** d’équivalent générique type Proton sur toutes les apps — Apple impose des contraintes fortes | Hors « quick win » documentaire ; à spécifier par plateforme |
| **OTA mobile** sans store (install depuis ton PC vers téléphones) | **Android** : réaliste avec **APK signé** + canal de version ; **iOS** : **TestFlight** (compte Apple dev) ou **MDM entreprise** — pas de simple « push APK » | § 4 ci-dessous |

---

## 2. Mises à jour **par microservice** (sans tout casser)

1. **CI** : images **`ghcr.io/<owner>/cloudity-<svc>:<tag>`** (cf. **BACKLOG** Q24, workflow `docker-publish.yml`).
2. **Portainer** : dans la stack concernée, monter uniquement le **`TAG=`** (ou digest) du service modifié ; **`docker compose pull && up -d`** sur cette stack — les autres stacks **inchangées** continuent de tourner.
3. **Migrations SQL** : appliquer **`cloudity-db-migrate`** (ou équivalent) **avant** ou **avec** la montée de version du service qui lit le nouveau schéma — ordre documenté dans **TESTS.md** / **DEPLOIEMENT** § ordre des stacks.
4. **Rollback** : tag d’image précédent + **§ 10 bis** **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

> **Portainer « Business »** : l’édition **Community Edition (CE)** suffit pour stacks + registry pull ; les fonctionnalités payantes ne sont **pas** requises pour déployer Cloudity.

---

## 3. Branches Git, `prod`, et flux « je ne casse pas le reste »

| Pratique | Recommandation |
|----------|----------------|
| **`main` / `dev` / `feat/*`** | Déjà décrit dans **[GIT.md](../GIT.md)** — intégration sur **`dev`**, **`main`** stable. |
| Branche **`prod`** *uniquement* pour déclencher builds « store / binaire » | Possible **si** tu fixes la règle : ex. **tags `v*.*.*` sur `main`** déclenchent déjà GHA ; une branche `prod` peut **dupliquer** `main` à taguer ou servir de déclencheur `workflow_dispatch` — à **documenter une fois** pour éviter les doubles vérités. |
| **Fichiers d’environnement** | **Jamais** de secrets dans Git — **[SECRETS.md](../securite/SECRETS.md)** ; prod = variables Portainer / fichier **hors dépôt**. |

---

## 4. Distribution **mobile** hors Google Play (Android d’abord)

### 4.1 Chaîne minimale réaliste

1. **Build** : `flutter build apk --release` (ou **AAB** si un jour Play Console) ; **signature** avec un keystore **dédié Cloudity** (conservé **hors Git**, backup chiffré).
2. **Canal de vérité** : fichier **`version.json`** (ex. servi en **HTTPS** sur un hôte statique ou une route **gateway** en lecture seule) :

   ```json
   { "app": "cloudity-mail", "version": "0.4.2", "min_supported": "0.4.0", "apk_url": "https://…/cloudity-mail-0.4.2.apk", "sha256": "…" }
   ```

3. **App** : au démarrage (ou en tâche de fond), **GET** `version.json` → si `version` > version installée → proposer **Télécharger** → **`PackageInstaller`** / intent d’installation (**permission** `REQUEST_INSTALL_PACKAGES` sur Android 8+ ; UX « sources inconnues » selon OEM).
4. **Sans clic web** : tout peut être **in-app** (dialogue « Mise à jour disponible ») — la page web n’est **pas** obligatoire ; c’est une **décision UX**.

### 4.2 Limites **iOS**

Sans **compte développeur Apple** + **TestFlight** (ou distribution entreprise / MDM), il n’existe **pas** de mécanisme supporté pour installer à distance des builds arbitraires comme un APK Android. Le plan OTA doit **séparer** Android / iOS.

### 4.3 Web + API

- **Web** : déploiement = nouvelle image **`cloudity-web`** ou nginx statique ; cache bust via **hash de assets** (Vite) — pas besoin d’« OTA » côté navigateur au-delà du rechargement.
- **API** : rolling update conteneur **gateway** / services — mêmes règles que § 2.

---

## 5. Pass, **alias mail**, Mail web/mobile (alignement produit)

| Besoin | Où c’est traité aujourd’hui | Suite technique |
|--------|----------------------------|-------------------|
| API alias / boîtes / domaines | Gateway admin **`/mail/domains*`**, **`/mail/mailboxes*`**, **`/mail/aliases*`** ; utilisateur **`POST …/accounts/:id/aliases`** | **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** § **2** |
| Créer un alias **depuis l’UI Pass** (comme Proton) | Case **BACKLOG** (Pass) | À implémenter après stabilisation J8 |
| **Extension** navigateur autofill | **MP-06** | **BACKLOG** L2 |
| **Mobile Mail** MVP | **`mobile/mail/README.md`** | Compléter selon **ROADMAP APP-01** + sync **SYNC-BACKLOG** |

La **synchronisation** « Pass ↔ Mail ↔ mobile » n’est pas un seul switch : elle passe par **les mêmes JWT**, les **mêmes endpoints gateway**, et des **règles produit** (alias enregistrés côté Cloudity + DNS/MX côté fournisseur — rappel **SYNC-BACKLOG § 2**).

---

## 6. Compte **admin**, boîtes mail, HTTPS

- **Dev** : **`make seed-admin`** — compte démo **admin** ; connexion **Mail** web/mobile avec les **mêmes identifiants** si la boîte IMAP est reliée au compte (flux documenté **TESTS.md** / **MOBILES.md**).
- **Prod** : **inscription / création de comptes** = flux **public** déjà côté auth ; **rôle admin** = promotion **contrôlée** (pas de compte admin par défaut sur Internet) — durcir **AUDIT-SECURITE** / **NPM** (ACL IP sur `/4dm1n` si besoin).
- **HTTPS** : terminée **côté NPM** (certificats **Let’s Encrypt**) — pas besoin d’exposer les ports microservices ; voir **DEPLOIEMENT** § 8.

---

## 7. Ordre de lecture recommandé (implémentation réelle)

1. **[STATUS.md](../../STATUS.md)** — § *À faire maintenant* + tableau feuille de route **A–F** (phase **F** = releases / distribution).
2. **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** — Mail, alias, Pass.
3. **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** — stacks, NPM, secrets.
4. Ce fichier — **distribution** / **OTA** / **releases**.

---

## 8. Suivi dans le dépôt

Les cases à cocher **REL-*** et **PASS-ALIAS-UI** / **PASS-AUTOFILL-ANDROID** vivent dans **[../../BACKLOG.md](../../BACKLOG.md)** (section *Release & distribution*).

---

*Créé : 2026-05-16 — synthèse « prod partielle + OTA + Pass/alias + NPM » ; détail des tâches : **BACKLOG**.*
