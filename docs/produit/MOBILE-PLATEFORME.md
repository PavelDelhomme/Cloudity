# Mobile & multi-plateforme (fiche unique)

## Sommaire

1. [Apps mobiles](#apps-mobiles)
2. [Multi-plateforme](#multi-plateforme)

---

# Apps mobiles

## CLOUDITY — Stratégie applications mobiles

**Rôle** : décrire, pour **chaque produit** de la suite, les cibles **web** vs **mobile utilisateur**, et traiter à part le **back-office administrateur mobile**. Ce fichier complète **[ROADMAP.md](ROADMAP.md)** (fonctionnalités détaillées) et **[STATUS.md](../../STATUS.md)** (suivi technique). Index des guides : **[README.md](../README.md)**.

**Principe** : une même **API** (`api-gateway` + JWT) sert le **web** et le **mobile**. Le détail fonctionnel de chaque app reste dans ROADMAP (APP-xx).

> **Vue transversale (web + mobile + desktop Linux + extension navigateur)** : voir **[MOBILE-PLATEFORME.md](MOBILE-PLATEFORME.md)** — c'est désormais ce document qui fait foi pour la **matrice apps × plateformes complète**. `MOBILE-PLATEFORME.md` reste centré sur la séquence mobile vs web et sur l'admin mobile (§ 2).

---

## 0. Web d’abord, mobile ensuite (gouvernance produit)

| Règle | Détail |
|--------|--------|
| **Séquence** | Pour une app donnée (ex. **Photos**, **Mail**), on **livre et durcit** le parcours **web** (`/app/…`, **`@cloudity/web`**) : navigation, listes, édition, corbeilles dédiées, etc. Le **mobile** (`mobile/<app>`, Flutter) suit pour **aligner** la même API et la même sémantique (pas l’inverse). |
| **Pourquoi** | Une seule base **HTTP + JWT** ; itérations plus rapides sur le web ; contrats d’API et textes métier validés avant d’investir dans les écrans natifs, widgets et **WorkManager** / push. |
| **Documentation** | **TODO.md** § « Ordre de livraison » ; **PHOTOS.md** § 6 (ordre livraison Photos) ; **SYNC-BACKLOG** (sync web ↔ mobile une fois les deux clients existent). |
| **Tests** | Web : **Vitest** + **`make test`**. Mobile : **`make test-mobile-*`** / **`make test-mobile-suite`** — **TESTS.md** § 1b. |

Les lignes du tableau § **1** ci-dessous restent la **cible** (web **et** mobile) ; la colonne **Notes** précise l’état ou le dossier Flutter quand il existe déjà.

---

## 1. Matrice produit × plateforme

Légende : **Web** = application navigateur (**`frontend/apps/cloudity-web`**, package **`@cloudity/web`**). **Mobile** = app native ou **Flutter** / **React Native** / PWA selon choix d’implémentation (à figer par produit).

| Produit | ID ROADMAP | Web (cible) | Mobile utilisateur | Notes |
|---------|------------|-------------|-------------------|--------|
| **Mail** | APP-01 | Oui (prioritaire) | Oui (`mobile/mail`) | Connexion ; multi-boîtes ; sync IMAP ; **`last_sync_error` affiché** (bannière inbox + liste boîtes + snackbar) ; resaisie MDP via web ; push système = plus tard |
| **Drive** | APP-02 | Oui | Oui (`mobile/drive`) | MVP mobile : liste racine + dossiers (`GET /drive/nodes`) ; `make run-mobile APP=Drive` ; **`make test-mobile-drive`** ou phase 5 **`make test-mobile-suite`** / **`make tests`** — **[TESTS.md](../operations/TESTS.md)** § 1b |
| **Office** | APP-03 | Oui (édition complète) | Viewer + édition légère (cible) | Parité complète difficile sur petit écran — prioriser lecture + commentaires |
| **Pass** | APP-04 | Oui | **MVP lecture + création coffre mobile (2026-08-28)** | `mobile/pass/` — Android + Linux desktop. Connexion Cloudity puis unlock MK ; **première utilisation** : `POST /pass/vaults` depuis l’app (plus besoin du web). Lecture entrées ; **édition items = L2** |
| **Calendar** | APP-05 | Oui | Oui | Rappels natifs, widgets |
| **Notes** | APP-06 | Oui | Oui | Saisie rapide, dictée (option) |
| **Tasks** | APP-07 | Oui | Oui | Widgets, notifications échéance |
| **Contacts** | APP-08 | Oui | Oui | Intégration répertoire téléphone (permissions) |
| **Photos** | APP-09 | Oui (galerie + **`/photos/timeline`**) | Oui (`mobile/photos`) | **Connexion** + session persistée ; `make run-mobile APP=Photos` ; **`make test-mobile-photos`** ou suite **`make test-mobile-suite`** (Photos+Drive+Mail) / **`make tests`** phase 5 — **[PHOTOS.md](PHOTOS.md)** § 5, **[TESTS.md](../operations/TESTS.md)** § 1b |
| **AppHub / launcher** | APP-10 | Oui | Shell / deep links | App mobile peut être un **conteneur** avec modules ou apps séparées |
| **Admin back-office** | ADM-01 | Oui | Voir § 2 | Jamais mélangé aux apps grand public |

---

## 2. Administration mobile (ADM-02)

| Champ | Contenu |
|--------|---------|
| **Public** | Administrateurs de tenant / plateforme (pas les utilisateurs finaux Drive/Mail seuls). |
| **Objectif** | Approuver utilisateurs, consulter stats, recevoir alertes, actions d’urgence limitées. |
| **Plateformes** | iOS, Android. |
| **Périmètre MVP suggéré** | Login 2FA ; liste users du tenant ; désactivation compte ; lecture stats santé (gateway / services) ; **pas** tout le CRUD lourd (préférer web pour les grosses opérations). |
| **Sécurité** | Sessions courtes ; pas de stockage secret en clair ; alignement TR-01 / TR-04. |
| **Statut** | Non démarré. |
| **Référence** | ROADMAP **ADM-02** ; STATUS § 0b (auth partagée). |

---

## 3. Stack technique recommandée (indicatif)

| Option | Avantages | Inconvénients |
|--------|-----------|----------------|
| **Flutter** (une codebase iOS/Android/Web) | Déjà mentionné dans STATUS pour Pass/Mail ; UI cohérente | Poids binaire ; intégration web dans la suite React actuelle à cadrer |
| **PWA** | Pas de store ; réutilise le front web | Push et accès fichiers limités selon OS |
| **Natif Swift + Kotlin** | UX plateforme maximale | Double maintenance |

**Décision produit** : à noter ici quand figée (ex. « Pass mobile = Flutter »). En attendant, chaque ligne ROADMAP **Plateformes** reste la source fonctionnelle.

---

## 4. Dépendances transversales mobiles

- **Auth** : refresh token, stockage sécurisé (Keychain / Keystore).
- **Push** : service notifications (à ajouter infra) pour Mail, Calendar, Tasks.
- **Deep links** : `cloudity://mail/...` ou Universal Links pour ouvrir le bon écran depuis une notification.
- **Tests** : **Vitest** (dashboard web) + **Flutter** — **`make test-mobile-suite`** = **Photos** → **Drive** → **Mail** : `flutter test` (hôte) + **`integration_test`** sur **ADB** si appareil + SDK inscriptible (gateway **auto**, compte démo par défaut). **`make test-mobile-{photos,drive,mail}`** pour une app. **Phase 5** **`make tests`** — **[TESTS.md](../operations/TESTS.md)** § 1b. **Stockage partagé** `cloudity_suite_*` (Photos, Drive, Mail).
- **Package Dart partagé `mobile/cloudity_shared`** : helpers HTTP communs (`http_helpers.dart` — `getAuthHeaders`, headers `application/json`, etc.) consommés par **`mobile/mail`**, **`mobile/drive`** et **`mobile/photos`** via une dépendance `path: ../cloudity_shared`. Ajouter ici toute logique mobile **transverse pure Dart** (parsing, formats, sémantique JWT) ; éviter d’y mettre du Flutter widget ou du runtime spécifique à une app. Import : `package:cloudity_shared/http_helpers.dart` (ou le barrel `package:cloudity_shared/cloudity_shared.dart`). Pendant lié côté web : **`@cloudity/web/apiFetch`** (`apiJson`, `apiJsonOk`).

### 4.1 Auth suite mobile (compte déjà enregistré)

Objectif UX : lorsqu’une app Cloudity est déjà connectée sur le téléphone, une nouvelle app (Photos, Drive, Mail, Pass…) doit proposer **« Continuer avec ce compte »**, **« Ajouter un autre compte »** ou **« Créer un compte »**. L’utilisateur ne doit pas saisir un `tenant_id` technique.

État actuel (**2026-08-28**) :

- **Tenant auto** : login mobile sans champ tenant — résolution par e-mail côté `auth-service` ; le tenant est persisté depuis le JWT / réponse API.
- **Gateway prédéfini (H14)** : `CLOUDITY_MOBILE_GATEWAY_URL` → API gateway HTTPS en prod. Écran connexion unifié (`CloudityLoginScreen` + `login_screen_shell.dart`) : e-mail + mot de passe uniquement en release.
- **Broker Android (9 apps)** : `mobile/cloudity_auth_broker` — `ContentProvider` chiffré (`${applicationId}.cloudity.auth`), permissions signature `fr.cloudity.permission.*_AUTH_BROKER`. Packages couverts : Mail, Drive, Photos, Pass, Calendar, Contacts, Notes, Tasks, Admin.
- **UX type Google** : si une app est déjà connectée, les autres proposent **« Continuer avec un compte Cloudity »** ; **1 compte** → reprise automatique au démarrage (`loadValidatedSession` + `_bootstrapLogin`) ; plusieurs comptes → tuile par e-mail avec indication de l’app source (ex. « Connecté sur Cloudity Mail »).
- **Passkeys / empreinte** : bouton « Connexion empreinte / passkey », proposition d’enregistrement après login mot de passe, tentative auto au démarrage. Prérequis prod : `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS` (incl. `android:apk-key-hash:…`) passés à **`auth-service`** dans `docker-compose.ghcr.yml` ; `/.well-known/assetlinks.json` servi par `cloudity-web` (voir § 4.2).
- **OTA** : `make mobile-upload-all` + install Samsung — **[DISTRIBUTION.md](../operations/DISTRIBUTION.md)**.

Historique (2026-05-21) : premier broker limité à Mail / Drive / Photos ; stockage local isolé par package sans broker.

Suite : iOS Keychain Access Group · keystore release (regénérer `assetlinks.json`).

### 4.2 Passkeys Android (Digital Asset Links)

Pour Bitwarden / Credential Manager sur apps natives :

| Composant | Détail |
|-----------|--------|
| **RP ID prod** | `cloudity.delhomme.ovh` (`WEBAUTHN_RP_ID`) — **pas** `api.` |
| **Origines** | URLs HTTPS web + `android:apk-key-hash:<base64url>` du certificat APK |
| **assetlinks.json** | `frontend/apps/cloudity-web/.well-known/assetlinks.json` (copié dans l’image nginx) — une entrée par `applicationId` |
| **Manifests** | intent-filter `android:autoVerify="true"` → `https://cloudity.<domaine>` |
| **Génération** | `./scripts/mobile/mobile-generate-assetlinks.sh dist/mobile-apk/cloudity_mail-*.apk` |

Vérification prod :

```bash
curl -sS https://cloudity.<domaine>/.well-known/assetlinks.json | jq 'length'
curl -sS -X POST https://api.cloudity.<domaine>/auth/webauthn/login/begin-discoverable | jq '.options.publicKey.rpId'
```

Doc détaillée : **[PASS.md](PASS.md)** (étendu à toute la suite).

---

## 5. Lancer une app en local (`make run-mobile`)

Commande unique à la racine du repo (Flutter requis sur la machine). **`APP=`** est **insensible à la casse** ; les guillemets sont optionnels (`APP=Mail` ou `APP="Mail"`).

```bash
make run-mobile APP=Admin
make run-mobile APP="Drive"
make run-mobile APP="Mail"
make run-mobile APP="Calendar"
make run-mobile APP="Contacts"
make run-mobile APP="Photos"
```

| `APP=` | Dossiers reconnus (le premier qui existe est utilisé) |
|--------|-----------------------------------------------------------|
| **Admin** | `mobile/admin_app/` |
| **Drive** | `mobile/drive/` ou `mobile/drive_app/` |
| **Mail** | `mobile/mail/` ou `mobile/mail_app/` |
| **Calendar** | `mobile/calendar/` ou `mobile/calendar_app/` |
| **Contacts** | `mobile/contacts/` ou `mobile/contacts_app/` |
| **Photos** | `mobile/photos/` ou `mobile/photos_app/` |
| **Pass** | `mobile/pass/` ou `mobile/pass_app/` |

Si aucun dossier n’existe pour l’`APP` demandé, le script affiche comment créer le projet (`flutter create …`) et sort avec le code **2** (comportement voulu : *pas encore implémenté*, pas un crash). Dans le dépôt actuel : **`Photos`**, **`Drive`**, **`Mail`** et **`Admin`** (si présent) sont lançables ; **Calendar**, **Contacts**, etc. le seront une fois le dossier Flutter créé.

Variables utiles en dev : `VITE_API_URL` côté web ; côté mobile Flutter, configurer l’URL du **gateway** via `CLOUDITY_MOBILE_GATEWAY_URL`. Valeurs typiques : **émulateur** `http://10.0.2.2:6080` ; **téléphone USB** `adb reverse tcp:6080 tcp:6080` puis `http://127.0.0.1:6080` ; **préprod/prod** `https://api.cloudity.<domaine>`. Une URL `https://IP_LAN:6080` ne suffit pas toute seule : il faut que la gateway soit réellement servie en TLS et que le téléphone fasse confiance au certificat (cert public ou CA locale installée). Erreurs réseau brutes (`errno = 101`, timeout, refus) → message lisible via `cloudity_shared` **`friendlyNetworkMessage`** sur les écrans de connexion.

**Erreur Arch `Wrong full snapshot version`** : le binaire `/usr/bin/flutter` (paquet pacman) est souvent désynchronisé. **Ne pas** lancer `flutter run` directement depuis `mobile/pass`. À la racine du repo :

```bash
make ensure-flutter-sdk    # installe/répare ~/.local/share/cloudity-flutter (SDK officiel)
make run-mobile APP=Pass   # utilise automatiquement ce SDK + gateway .env
```

**SDK Arch (`/usr/lib/flutter`) en lecture seule** : `make run-mobile` échoue tant que Gradle ne peut pas écrire sous `flutter_tools/gradle` — le SDK Cloudity dans `$HOME` (`make ensure-flutter-sdk`) contourne ce problème sans toucher au paquet système.

**Note** : `make init-mobile` parcourt aussi `mobile/contacts`, `mobile/photos`, `mobile/pass` lorsqu’ils existent. Suite produit : **[SYNC-BACKLOG.md](SYNC-BACKLOG.md)** (scaffold + CI).

### USB / ADB : appareil `unauthorized`

Si `adb devices` affiche `unauthorized` à côté du téléphone :

1. **Déverrouillez l’écran** du téléphone : une fenêtre **« Autoriser le débogage USB ? »** doit apparaître — cochez **Toujours autoriser** pour cet ordinateur puis **OK** (empreinte RSA).
2. Si rien n’apparaît : **Paramètres → Options pour les développeurs** → **Révoquer les autorisations de débogage USB**, débranchez/rebranchez le câble, relancez `adb devices`.
3. Câble / mode USB : préférez **Transfert de fichiers (MTP)** et un câble **données** (certains câbles ne font que la charge).
4. En dernier recours : `adb kill-server` puis `adb start-server`, puis reconnecter le téléphone.

Tant que l’état reste `unauthorized`, **`flutter run` ne pourra pas installer** l’app sur l’appareil.

---

## 7. OTA Android — mises à jour sécurisées (local / dev / prod)

| Env | Gateway | Comment publier |
|-----|---------|-----------------|
| Local | `http://127.0.0.1:6002` | `DEPLOY_URL=http://127.0.0.1:6002 make mobile-upload-apk APP=Mail` |
| LAN | `http://192.168.x.x:6002` | idem + `adb reverse` ou IP LAN |
| **Prod** | `https://api.cloudity.delhomme.ovh` | UI **`/4dm1n` → Déploiements** (upload APK) **ou** `make mobile-upload-apk` / `make mobile-upload-all` |

Flux app : au login, `SuiteAppShell` → `GET /deploy/mobile/manifest?app=cloudity_*` → dialogue si version serveur > installée → télécharge `apk_url` HTTPS.

**Web (Android, non connecté)** : page login avec `?next=/app/notes` → bannière « Télécharger l’APK » ; accueil `/` → grille des apps Android disponibles.

**Samsung / ADB** : `make mobile-install-device CLOUDITY_DEVICE_PROFILE=samsung-sm-g990b2 DEPLOY_URL=https://api.cloudity.delhomme.ovh`

| App Flutter | Slug OTA | Dossier |
|-------------|----------|---------|
| Mail | `cloudity_mail` | `mobile/mail` |
| Drive | `cloudity_drive` | `mobile/drive` |
| Photos | `cloudity_photos` | `mobile/photos` |
| Pass | `cloudity_pass` | `mobile/pass` |
| Calendar | `cloudity_calendar` | `mobile/calendar` |
| Contacts | `cloudity_contacts` | `mobile/contacts` |
| Notes | `cloudity_notes` | `mobile/notes` |
| Tasks | `cloudity_tasks` | `mobile/tasks` |
| Admin | `cloudity_admin` | `mobile/admin_app` |

**Web + backends** (pas d’APK) : `make push-prod` ou `make admin-deploy-prod MODE=web` → images GHCR → Portainer GitOps + Watchtower.

Détail ops : [`DISTRIBUTION.md`](../operations/DISTRIBUTION.md) · [`DEPLOY-MATRIX.md`](../operations/DEPLOY-MATRIX.md).

---

## 8. Checklist d’avancement (à cocher)

- [ ] Choisir stack par défaut (Flutter vs PWA vs mixte).
- [x] Cible `make run-mobile APP=…` (`scripts/run-mobile.sh`) — **Admin** exécutable d’office ; les autres dès qu’un dossier Flutter correspondant existe (voir tableau § 5).
- [x] OTA HTTPS : gateway + UI `/4dm1n` → Déploiements + `make mobile-upload-all` (voir § 7).
- [ ] Pipeline build iOS/Android (CI) — en local : **`make test-mobile-suite`** (ou Photos / Drive seuls) + phase 5 de **`make tests`** (ADB optionnel).
- [ ] Publication stores (comptes, politique confidentialité).
- [ ] **ADM-02** : MVP admin mobile après stabilisation ADM-01 web.

---

*Fichier : `docs/produit/MOBILE-PLATEFORME.md`. Dernière révision : 2026-08-28.*

---

# Multi-plateforme

---
slug: multi-plateforme
---

## CLOUDITY — Matrice multiplateforme & plan de couverture

> **Rôle** — décrire **toutes les surfaces clientes** par application (web,
> mobile Android/iOS, desktop Linux, extension navigateur), leur **état
> réel** (livré / scaffold / non démarré), et l'**ordre rentable** pour
> combler les manques.
>
> **Complète** : [`MOBILE-PLATEFORME.md`](./MOBILE-PLATEFORME.md) (focus mobile vs web),
> [`ROADMAP.md`](./ROADMAP.md) (fonctionnel détaillé par APP-xx),
> [`PASS.md`](./PASS.md) (sprint en cours).
>
> **Convention couleurs** :
> - ✅ **livré et utilisable** (au moins un parcours complet)
> - 🟡 **scaffold / squelette** (cible Flutter ou dossier présent, pas de
>   build prouvé / pas de parcours réel)
> - ❌ **non démarré**
> - ⛔ **non pertinent** (l'app n'a pas vocation à exister sur cette
>   plateforme — ex. extension navigateur pour Photos)
>
> **Source de vérité** : ce fichier. Si la matrice ci-dessous diverge de
> `MOBILE-PLATEFORME.md` ou de `ROADMAP.md`, **c'est ici qui fait foi**. On
> recopie ensuite vers les autres docs pour rester cohérent.

---

## 1. Matrice « apps × plateformes »

État au **2026-05-13** (J7 sprint Pass).

| App | Web | Android | iOS | Linux desktop | macOS desktop | Windows desktop | Extension navigateur |
|---|---|---|---|---|---|---|---|
| **Mail** (APP-01)     | ✅ `cloudity-web`            | ✅ `mobile/mail` | 🟡 cible Flutter `ios/` mais non testée | ❌ pas de cible Flutter `linux/` à scaffold | ❌ | ❌ | ⛔ |
| **Drive** (APP-02)    | ✅ `cloudity-web`            | ✅ `mobile/drive` (MVP racine) | 🟡 cible Flutter `ios/` non testée | 🟡 Flutter `linux/` + ❌ **sync dossier OS** ([DRIVE-DESKTOP-SYNC](DRIVE-DESKTOP-SYNC.md)) | 🟡 Flutter `macos/` + ❌ sync OS | 🟡 Flutter `windows/` + ❌ sync OS | ⛔ |
| **Pass** (APP-04)     | ✅ `cloudity-web`            | ✅ `mobile/pass` (lecture seule) | ❌ pas de cible Flutter `ios/` | ✅ `mobile/pass/linux/` (Flutter desktop) | ❌ | ❌ | 🟡 `extensions/cloudity-pass/` squelette MV3 (livré 2026-05-13) |
| **Photos** (APP-09)   | ✅ `cloudity-web`            | ✅ `mobile/photos` | 🟡 cible `ios/` non testée | 🟡 cible `linux/` scaffoldée jamais validée | 🟡 cible `macos/` scaffoldée | 🟡 cible `windows/` | ⛔ |
| **Calendar** (APP-05) | ❌ pas de page web dédiée    | 🟡 `mobile/calendar/` placeholder (livré 2026-05-13) | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **Notes** (APP-06)    | ❌                           | ❌ | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **Tasks** (APP-07)    | ❌                           | ❌ | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **Contacts** (APP-08) | ❌                           | ❌ | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **Office** (APP-03)   | ❌ MVP non démarré           | ❌ | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **Admin** (ADM-01)    | ✅ `cloudity-web /4dm1n`     | 🟡 `mobile/admin_app` squelette riverpod+go_router, sans login | ❌ | ❌ | ❌ | ❌ | ⛔ |
| **AppHub** (APP-10)   | ✅ `cloudity-web /app`       | n/a — chaque app mobile est autonome | n/a | n/a | n/a | n/a | ⛔ |

**Lecture rapide** :

* Sur les 11 apps de la suite, **4** ont un parcours web réel : Mail,
  Drive, Pass, Photos (+ Admin via `/4dm1n`).
* Les **3 apps mobiles utilisateur livrées et testées** sont Mail,
  Drive, Photos (+ Pass en lecture seule). Les autres mobiles sont des
  scaffolds non utilisables.
* Les **cibles desktop Flutter** existent côté Drive / Photos /
  Pass / Mail mais **seules celles de Pass tournent vraiment**. Les
  autres ont juste les répertoires `linux/` créés par `flutter create`,
  jamais buildés.
* **Drive sync bureau type Nextcloud** (dossier OS miroir, GNOME/CLI/
  Windows/macOS) : **❌ non démarré** — distinct du Flutter desktop.
  Voir **[DRIVE-DESKTOP-SYNC.md](DRIVE-DESKTOP-SYNC.md)** (`DRIVE-DESKTOP-01`…`05`).
* L'**extension navigateur Pass** vient d'avoir son squelette MV3
  poussé. Pas encore de build / publication.

---

## 2. Pourquoi cette matrice (vs juste MOBILE-PLATEFORME.md) ?

`MOBILE-PLATEFORME.md` ne couvre que la dimension **mobile vs web**. La question
posée régulièrement par le projet (et par toi en 2026-05-13) est :

> *« On a aussi à créer les dossiers et projets pour l'extension
> navigateur Pass, l'app Linux Pass, les apps mobiles Calendar /
> Photos / Drive, et les apps Linux desktop pour Drive et Photos en
> plus du web. »*

→ Il manquait une vue **transversale** qui réponde à cette question.
C'est ici. Cette matrice sert de checklist quand on planifie un
chantier qui doit toucher plusieurs surfaces.

---

## 3. Stratégie : ne pas tout démarrer en parallèle

### 3.1 Priorité absolue (sprint Pass — d'ici 2026-05-20)

| Surface | État sortie sprint Pass | Comment |
|---|---|---|
| `cloudity-web` Pass (vault, import Proton, TOTP, recovery codes) | ✅ J3+J4+J5+J6 | livré |
| `mobile/pass` lecture seule | ✅ J7 | livré |
| `extensions/cloudity-pass/` squelette MV3 | ✅ J7 ter (2026-05-13) | squelette + manifest + popup + content + README ; build esbuild prêt |
| 2FA TOTP côté apps Dart Drive/Mail/Photos | ✅ J7 ter | livré (parité avec web) |

### 3.2 Post-sprint (J+1 à J+5 après migration Proton)

| Surface | Effort estimé | Justification |
|---|---|---|
| Extension navigateur Pass — autofill réel | 3 j | besoin d'ergonomie quotidienne pour adoption |
| `mobile/pass` édition complète (CRUD + sync optimiste + import Proton mobile) | 3-4 j | besoin pour utilisateur en mobilité |
| `mobile/calendar/` scaffold + écran « événements à venir » lecture seule | 2 j | placeholder utile dès qu'un backend `calendar-service` minimal existera (cf. ROADMAP APP-05) |

### 3.3 Plus tard (~juin-juillet 2026)

| Surface | Effort estimé | Justification |
|---|---|---|
| Apps **Linux desktop** Drive / Photos / Mail (Flutter) | 1 j de validation `flutter run -d linux` par app + plombage cible Linux Mail (manque `linux/` dans `mobile/mail`) | les targets existent déjà sauf Mail ; le plus gros travail est l'UX desktop (clavier/souris vs touch) |
| **Client sync Drive bureau** (type Nextcloud) | Spec + daemon Linux puis UI/packaging — **[DRIVE-DESKTOP-SYNC.md](DRIVE-DESKTOP-SYNC.md)** | besoin produit fort : dossier local sync auto (GNOME, Arch, Windows, macOS, CLI) ≠ app Flutter |
| App `calendar-service` backend Go + page web Calendar | 5-7 j | nécessite migration DB + sync iCal/CalDAV (Phase produit C) |
| Apps **mobile/notes**, **mobile/tasks**, **mobile/contacts** | ≥ 5 j chacune | hors-sprint, dépend de la priorité produit (Notes > Tasks > Contacts) |
| Extensions **Firefox** + **Safari** Pass | dérive de l'extension Chromium MV3 | `manifest.json` partagé + adaptations API extension (Safari = Web Extensions API) |
| **PWA installable** Cloudity-Web | 1 j | pour donner un raccourci desktop sans build natif |

---

## 4. Conventions de scaffolding

### 4.1 Apps Flutter (mobile + desktop)

* Sous `mobile/<app>/`, un seul `pubspec.yaml`, partageant les deps via
  `cloudity_shared` (HTTP helpers + `Auth2FAClient`).
* Cibles activées par `flutter create --platforms=android,ios,linux .`
  selon les besoins. **Ne pas** activer `web` côté Flutter — la
  surface web reste sur `cloudity-web` (React/Vite).
* `pubspec.yaml` doit déclarer `cloudity_shared: { path: ../cloudity_shared }`
  pour bénéficier du flow 2FA mutualisé.

### 4.2 Extension navigateur (`extensions/<extension>/`)

* Manifest **MV3** uniquement (Chrome / Edge / Firefox supportent ;
  Safari nécessite un wrapper Xcode séparé).
* Build **esbuild** ou **Vite** (à figer côté Pass dès l'autofill réel).
  L'extension consomme **`@cloudity/pass-crypto`** via npm workspace
  → bit-à-bit interop web/mobile/extension.
* `permissions` minimaux (`storage`, `activeTab`, `scripting`) ; pas
  de `host_permissions: ["*://*/*"]` global avant validation produit
  (passer par un domain matcher utilisateur).
* Le **mot de passe maître** n'est **jamais** stocké en clair par
  l'extension : la master key vit en mémoire `service_worker`
  (background) avec timer auto-lock identique à
  `mobile/pass/lib/vault_controller.dart` (5 min).

### 4.3 Lien entre extension et app web

* Pour la phase 1, l'extension utilise les **mêmes endpoints
  `passwords-service`** via `api-gateway` (Bearer JWT obtenu via
  `chrome.identity` ou copier-coller depuis l'app web — à figer).
* Phase 2 : intégration **Passkey** (login extension via WebAuthn
  Conditional UI) — branche directement sur les endpoints existants
  `auth/webauthn/login/begin-discoverable`.

---

## 5. Hygiène : éviter la dérive « 14 apps moitié-faites »

> **Règle d'or** : **on ne démarre pas une nouvelle surface tant que la
> précédente n'a pas un parcours utilisateur de bout en bout** (login →
> action principale → logout). Un scaffold flutter-create n'est pas un
> parcours.

| Anti-pattern | Conséquence | Garde-fou |
|---|---|---|
| Scaffolder `mobile/notes` parce qu'on a 2 h | parcours « se logue puis écran blanc » | bannir : page d'accueil = README expliquant pourquoi pas démarré |
| Activer `windows/` sur tous les Flutter | builds CI qui échouent en cascade | n'activer une cible qu'au moment où on s'y attelle |
| Forker l'extension en Firefox / Safari avant l'autofill Chromium | 3 builds à maintenir, aucun ne marche | extension Chromium d'abord ; portage = ticket séparé |

### 5.1 Sortie de scaffold = critère explicite

Un scaffold passe en « ✅ livré » quand :
1. Build local sans warning (`flutter build` ou `npm run build`).
2. Au moins un test fume (`flutter test` / vitest).
3. Doc d'install README mise à jour.
4. Entrée dans `STATUS.md` avec sa date de mise en route réelle.

---

## 6. Prochaines actions concrètes

| ID | Tâche | Échéance | Doc / fichier |
|---|---|---|---|
| **MP-01** | Squelette extension Pass MV3 (manifest + popup + background + content) | 2026-05-13 | `extensions/cloudity-pass/` |
| **MP-02** | Placeholder `mobile/calendar/` (README seul, pas de `flutter create`) | 2026-05-13 | `mobile/calendar/README.md` |
| **MP-03** | Cible `linux/` Flutter pour `mobile/mail` (lancement futur) | post-20 mai | TODO dans ce doc § 3.3 |
| **MP-04** | Validation Linux desktop Drive/Photos | livré 2026-05-21 | `make test-mobile-desktop-linux` · `docs/operations/TESTS.md` § desktop |
| **MP-05** | Service backend `calendar-service` + page web Calendar | post-20 mai (juin) | nouveau guide `docs/produit/CALENDAR.md` |
| **MP-06** | Autofill réel extension Pass (content script + domain matcher) | post-20 mai (J+1..J+5) | `extensions/cloudity-pass/src/content/` |
| **MP-07** | Édition complète `mobile/pass` | post-20 mai (J+1..J+5) | BACKLOG L2 sprint Pass |
| **MP-08** | Portage Firefox / Safari extension Pass | Firefox build initial ☑ 2026-05-21 | `extensions/cloudity-pass-firefox/` · Safari ☐ |

---

## 7. Références

* [`MOBILE-PLATEFORME.md`](./MOBILE-PLATEFORME.md) — focus mobile vs web (séquence
  livraison).
* [`ROADMAP.md`](./ROADMAP.md) — fonctionnel détaillé APP-xx.
* [`PASS.md`](./PASS.md) — sprint en
  cours, scope L1/L2/L3.
* [`docs/architecture/SERVICES.md`](../architecture/SERVICES.md) —
  conteneurs Docker (backend) — la matrice ci-dessus est côté
  **client** uniquement.
* [`docs/securite/URL-CAPABILITIES.md`](../securite/URL-CAPABILITIES.md)
  § 7 — couverture sécu mobile (parité 2FA).
