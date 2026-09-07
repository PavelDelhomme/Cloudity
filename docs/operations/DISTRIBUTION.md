# Distribution & releases (fiche unique)

> Build / publish APK, OTA in-app, stores, Linux desktop, prod partielle.  
> Déploiement Portainer : [`../../DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md).

## Sommaire

1. [Canaux](#1-canaux-de-distribution)
2. [Releases & prod partielle](#2-releases--prod-partielle)
3. [Linux desktop](#3-linux-desktop)

---

# 1. Canaux de distribution

## Canaux de distribution Cloudity

Stratégie multi-canal pour installer et mettre à jour les applications (web, mobile, desktop).

---

## 1. Vue d'ensemble

| Canal | Cible | Statut | Commande / doc |
|-------|--------|--------|----------------|
| **Web PWA** | Navigateur | ✅ Prod via GHCR + Watchtower | `make push-prod` |
| **OTA APK** | Android sideload | ✅ Prod HTTPS + UI admin | `make mobile-upload-apk` / `mobile-upload-all` · `/4dm1n` → Déploiements |
| **F-Droid** | Android libre | 📋 Métadonnées stub | `deploy/fdroid/` |
| **Google Play** | Android store | 📋 Checklist manuelle | § 4 ci-dessous |
| **TestFlight** | iOS | 📋 Compte Apple requis | § 5 |
| **Linux desktop** | .deb / Flatpak | 📋 Plan | `DISTRIBUTION.md` |

Version source : [`VERSION`](../VERSION) — affichage **`d+`** (dev) / **`p+`** (prod).

---

## 2. OTA self-hosted (Android) — URLs sécurisées

> **Client mobile** : téléchargement dans le **cache de l’app** + install système (`cloudity_ota_installer`) — **pas** d’ouverture navigateur, **pas** d’APK dans Téléchargements (fichier purgé après install).

| Env | Gateway | Manifeste / APK |
|-----|---------|-----------------|
| **Local** | `http://127.0.0.1:6002` (+ `adb reverse`) | `GET /deploy/mobile/manifest?app=…` · `GET /deploy/apk/…` |
| **Dev / LAN** | `http://192.168.x.x:6002` | idem |
| **Préprod** | `https://api.*-preprod.…` | TLS |
| **Prod** | `https://api.cloudity.delhomme.ovh` | TLS via NPM |

Stockage : volume **`cloudity_mobile_data`** (`MOBILE_RELEASE_DIR`). Upload : `POST /deploy/mobile/upload` + `MOBILE_APK_UPLOAD_TOKEN` (ou JWT admin sur `/admin/mobile/apk/upload`).

### Build & publier

```bash
## Une app
MOBILE_APK_UPLOAD_TOKEN=… DEPLOY_URL=https://api.cloudity.delhomme.ovh \
  make mobile-upload-apk APP=Mail

## Toutes (Mail Drive Photos Pass Calendar Contacts Notes Tasks)
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-all

## Ou depuis le navigateur admin (JWT) : /4dm1n → Déploiements → Publier OTA
```

Fichiers locaux :

- `dist/mobile-apk/cloudity_mail-X.Y.Z.apk`
- `dist/mobile-manifests/version-cloudity_mail.json`

Format manifeste (aussi servi par la gateway) :

```json
{
  "app": "cloudity_mail",
  "version": "0.1.0",
  "min_supported": "0.1.0",
  "apk_url": "https://api.cloudity.delhomme.ovh/deploy/apk/cloudity_mail/0.1.0",
  "sha256": "…",
  "published_at": "2026-08-19T12:00:00Z"
}
```

### Côté app Flutter

Au login / restore : `SuiteAppShell` (ou Pass maison) → `CloudityOtaClient.checkUpdate` → dialogue si version serveur > installée → téléchargement APK dans le **cache app** + install via `FileProvider` / intent système (**pas** de navigateur, **pas** de fichier dans Téléchargements).

| Action | Endpoint |
|--------|----------|
| Liste releases (UI admin) | `GET /admin/mobile/releases` |
| Upload JWT admin | `POST /admin/mobile/apk/upload` |
| Hold | `POST /admin/mobile/apk/hold?app=cloudity_mail&held=true` |
| Upload token CI | `POST /deploy/mobile/upload` + `MOBILE_APK_UPLOAD_TOKEN` |

Matrice web/API/mobile : [`DEPLOY-MATRIX.md`](DEPLOY-MATRIX.md).
---

## 3. F-Droid

Répertoire [`deploy/fdroid/`](../deploy/fdroid/) :

- `README.md` — procédure soumission
- `metadata/fr.cloudity.cloudity_mail.yml` — stub Fastlane/F-Droid

F-Droid exige :

- Code source public (GitHub ✅)
- Build reproductible (`flutter build apk` avec tag Git)
- Pas de dépendance Google Play Services obligatoire

---

## 4. Google Play Store

Checklist (manuelle) :

1. Compte Play Console (~25 USD one-time)
2. Keystore release **hors Git** (backup chiffré)
3. `flutter build appbundle --release` par app
4. Privacy policy URL publique
5. Data safety form
6. Internal testing → closed → production

Packages Android :

| App | Package |
|-----|---------|
| Mail | `fr.cloudity.cloudity_mail` |
| Drive | `fr.cloudity.cloudity_drive` |
| Photos | `fr.cloudity.cloudity_photos` |
| Pass | `fr.cloudity.cloudity_pass` |

Flavors recommandés : `dev` (`.dev` suffix) / `prod` (store).

---

## 5. iOS (TestFlight)

Sans compte Apple Developer (~99 USD/an) : **pas de distribution OTA** type APK.

Options :

- **TestFlight** : builds Xcode + upload Transporter
- **MDM entreprise** : usage interne uniquement

---

## 6. Web — pas d'« OTA »

Nouvelle image `cloudity-frontend` → Watchtower → rechargement navigateur (cache bust Vite).

---

## 7. Bump version

```bash
make bump-patch    # 0.1.0 → 0.1.1
make bump-minor
make bump-major
make admin-deploy-prod MODE=all   # web + mobile après bump
```

`versionCode` Android = `major×10000 + minor×100 + patch`.


---

# 2. Releases & prod partielle

## Releases, prod partielle, distribution mobile & mises à jour

**Rôle** : cadrer **sans illusion** comment livrer une **première prod utilisable** (Portainer + NPM + HTTPS), mettre à jour **service par service**, et ce qui est **réaliste** pour les **applications mobiles** hors Google Play — en lien avec **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)**, **[HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** (Q15), **[securite/SECRETS.md](../securite/SECRETS.md)** et le **[BACKLOG.md](../../BACKLOG.md)** (GHCR, stacks, **MP-*** / Pass).

---

## 1. Ce que « prod partielle » veut dire ici

| Objectif | Faisable tôt ? | Dépend de |
|----------|------------------|-----------|
| Stack Docker sur VPS + **NPM** + TLS (**Let’s Encrypt**) | Oui, une fois Q15 / décision prise | **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)** |
| **Web** + **API** (`cloudity-web`, `api-gateway`, auth, mail-directory…) avec images **taguées** | Oui | **Q24** — bump `TAG=` dans Portainer par stack |
| **Pass web** utilisable au quotidien (remplacer Proton Pass *côté web* en premier) | En cours — sprint J8 puis L2 | **[PASS.md](../produit/PASS.md)** |
| **Alias mail** créés depuis **Pass** + synchro **Mail** web/mobile | **Web Pass** : panneau **Alias mail** (`PassMailAliasesPanel`) — synchro boîte = même JWT / comptes Mail ; **mobile** = extension | **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** § **2** ; **BACKLOG** PASS-ALIAS-UI ; extension **MP-06** |
| **Autofill Pass sur toutes les apps mobiles** (par-dessus Chrome, banque, etc.) | **Android** : service d’**Autofill** (framework) + app déclarée ; **iOS** : **pas** d’équivalent générique type Proton sur toutes les apps — Apple impose des contraintes fortes | Hors « quick win » documentaire ; à spécifier par plateforme |
| **OTA mobile** sans store (install depuis ton PC vers téléphones) | **Android** : réaliste avec **APK signé** + canal de version ; **iOS** : **TestFlight** (compte Apple dev) ou **MDM entreprise** — pas de simple « push APK » | § 4 ci-dessous |

---

## 2. Mises à jour **par microservice** (sans tout casser)

**Feuille de route complète** : **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)** (phases Git → GHCR → Portainer → mobile).

**Guide détaillé** (commandes `make deploy-*`, matrice front/back/mobile) : **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)**.

1. **CI** : images **`ghcr.io/<owner>/cloudity-<svc>:<tag>`** (cf. **BACKLOG** Q24, workflow `docker-publish.yml`).
2. **Portainer** : dans la stack concernée, monter uniquement le **`TAG=`** (ou digest) du service modifié ; **`docker compose pull && up -d`** sur cette stack — les autres stacks **inchangées** continuent de tourner.
3. **Migrations SQL** : appliquer **`cloudity-db-migrate`** (ou équivalent) **avant** ou **avec** la montée de version du service qui lit le nouveau schéma — ordre documenté dans **TESTS.md** / **DEPLOIEMENT** § ordre des stacks.
4. **Rollback** : tag d’image précédent + **§ 10 bis** **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)**.

**Dev local (un seul service)** : `make deploy-web`, `make deploy-mail`, `make deploy-gateway`, etc. — voir **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)** § 2.

> **Portainer « Business »** : l’édition **Community Edition (CE)** suffit pour stacks + registry pull ; les fonctionnalités payantes ne sont **pas** requises pour déployer Cloudity.

---

## 3. Branches Git, `prod`, et flux « je ne casse pas le reste »

| Pratique | Recommandation |
|----------|----------------|
| **`main` / `dev` / `feat/*`** | Déjà décrit dans **[GIT.md](../GIT.md)** — intégration sur **`dev`**, **`main`** stable. |
| Branche **`prod`** *uniquement* pour déclencher builds « store / binaire » | Possible **si** tu fixes la règle : ex. **tags `v*.*.*` sur `main`** déclenchent déjà GHA ; une branche `prod` peut **dupliquer** `main` à taguer ou servir de déclencheur `workflow_dispatch` — à **documenter une fois** pour éviter les doubles vérités. |
| **Fichiers d’environnement** | **Jamais** de secrets dans Git — **[SECRETS.md](../securite/SECRETS.md)** ; prod = variables Portainer / fichier **hors dépôt**. |

---

## 3 bis. Distribution **Linux** & bureaux (`.deb`, Flatpak, Snap, AUR…)

Plan détaillé (sans date figée) : **[DISTRIBUTION.md](DISTRIBUTION.md)**.

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

- **Dev** : **`make seed-admin`** — compte démo **admin** ; connexion **Mail** web/mobile avec les **mêmes identifiants** si la boîte IMAP est reliée au compte (flux documenté **TESTS.md** / **MOBILE-PLATEFORME.md**).
- **Prod** : **inscription / création de comptes** = flux **public** déjà côté auth ; **rôle admin** = promotion **contrôlée** (pas de compte admin par défaut sur Internet) — durcir **AUDIT-SECURITE** / **NPM** (ACL IP sur `/4dm1n` si besoin).
- **HTTPS** : terminée **côté NPM** (certificats **Let’s Encrypt**) — pas besoin d’exposer les ports microservices ; voir **DEPLOIEMENT** § 8.

---

## 7. Ordre de lecture recommandé (implémentation réelle)

1. **[STATUS.md](../../STATUS.md)** — § *À faire maintenant* + tableau feuille de route **A–F** (phase **F** = releases / distribution).
2. **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** — Mail, alias, Pass.
3. **[../../DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)** — stacks, NPM, secrets.
4. Ce fichier — **distribution** / **OTA** / **releases**.

---

## 8. Suivi dans le dépôt

Les cases à cocher **REL-*** et **PASS-ALIAS-UI** / **PASS-AUTOFILL-ANDROID** vivent dans **[../../BACKLOG.md](../../BACKLOG.md)** (section *Release & distribution*).

---

*Créé : 2026-05-16 — synthèse « prod partielle + OTA + Pass/alias + NPM » ; détail des tâches : **BACKLOG**.*


---

# 3. Linux desktop

## Distribution Linux & bureaux (plan)

**Rôle** : cadrer les canaux **hors Docker** pour installer Cloudity (Pass, Mail, Drive, etc.) sur postes utilisateurs — **sans promesse de date** sur chaque format.

Complète **[DISTRIBUTION.md](DISTRIBUTION.md)** (mobile + web) et **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** (VPS).

---

## Périmètre par plateforme

| Plateforme | Formats envisagés | Priorité suggérée |
|------------|-------------------|-------------------|
| **Android** | APK signé + `version.json` OTA | P0 (déjà amorcé) |
| **iOS** | TestFlight / MDM entreprise | P2 |
| **Windows** | MSIX ou installeur signé (WiX / Inno) | P2 |
| **macOS** | `.dmg` + notarisation Apple | P3 |
| **Linux** | voir § Linux ci-dessous | P1–P2 |

---

## Linux — canaux recommandés

| Canal | Intérêt | Effort | Notes |
|-------|---------|--------|-------|
| **`.deb`** (Debian/Ubuntu) | Très demandé, CI simple | Moyen | `dpkg` + dépôt APT privé ou Packagecloud |
| **Flatpak** | Sandboxing, Flathub possible | Élevé | Bon pour desktop « store-like » |
| **Snap** | Ubuntu / snap store | Élevé | Confinement strict, review store |
| **AUR** (`yay` / `paru`) | Arch / Manjaro | Moyen | Paquet maintenu par la communauté ou script `PKGBUILD` officiel |
| **RPM** | Fedora / RHEL | Moyen | `rpmbuild` + Copr |
| **AppImage** | Portable, une binary | Faible–moyen | Pas de mise à jour auto intégrée sans plugin |
| **Tarball + script** | Homelab / power users | Faible | `install.sh` qui pose binaire Flutter + deps |

**Recommandation Cloudity** : commencer par **`.deb` + AppImage`** pour Flutter desktop ; ajouter **Flatpak** si besoin sandbox ; **Snap** et **AUR** en parallèle communautaire ou phase 2.

---

## Contenu d’un paquet desktop Linux

- Binaire Flutter (Pass / hub à terme)
- Icône `.desktop` (`~/.local/share/applications`)
- Dépendances : `libsecret`, GTK, keyring (selon `flutter build linux`)
- Fichier **`version.json`** local ou URL HTTPS pour mise à jour (même principe que mobile)

---

## Mises à jour applicatives (hors stores)

| Composant | Mécanisme |
|-----------|-----------|
| **Web** | Nouvelle image `cloudity-web` (hash assets Vite) |
| **API / microservices** | GHCR + Portainer (§ registry) |
| **Android** | `version.json` + APK |
| **Linux desktop** | APT repo versionné, ou `flatpak update`, ou AppImage + script |

---

## Registry Docker → Portainer (rappel)

Voir **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** phase B :

1. GHA **`docker-publish.yml`** pousse vers **GHCR** (`ghcr.io/<owner>/cloudity-<service>:<tag>`).
2. Portainer : stack avec `image:` + variable `TAG`.
3. Mise à jour : **Webhook Portainer** (POST après push GHA) ou **Watchtower** (homelab) ou pull manuel.
4. Vérification : healthcheck gateway + smoke test Mail/Drive.

**Ne pas** mélanger stack **Maddy** (ports 25/993) avec stack **Cloudity** (web/API).

---

## Snap & Flatpak — faisable ?

| | Snap | Flatpak |
|---|------|---------|
| **Faisable** | Oui | Oui |
| **Flutter** | `snapcraft.yaml` + plugin flutter | Manifest + `flatpak-builder` |
| **Contraintes** | Interfaces snap (network, secret) | Portals desktop |
| **Publication** | Snap Store review | Flathub review |

À traiter **après** un `.deb` ou AppImage qui fonctionne en local.

---

## Liens

- **[MOBILE-PLATEFORME.md](../produit/MOBILE-PLATEFORME.md)**
- **[BACKLOG.md](../../BACKLOG.md)** — cases **MP-***, Q24 GHCR
- **`TODOS.md`** § déploiement & distribution

