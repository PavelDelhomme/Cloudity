# CLOUDITY — Stratégie applications mobiles

**Rôle** : décrire, pour **chaque produit** de la suite, les cibles **web** vs **mobile utilisateur**, et traiter à part le **back-office administrateur mobile**. Ce fichier complète **[ROADMAP.md](ROADMAP.md)** (fonctionnalités détaillées) et **[STATUS.md](../../STATUS.md)** (suivi technique). Index des guides : **[README.md](../README.md)**.

**Principe** : une même **API** (`api-gateway` + JWT) sert le **web** et le **mobile**. Le détail fonctionnel de chaque app reste dans ROADMAP (APP-xx).

> **Vue transversale (web + mobile + desktop Linux + extension navigateur)** : voir **[MULTI-PLATEFORME.md](MULTI-PLATEFORME.md)** — c'est désormais ce document qui fait foi pour la **matrice apps × plateformes complète**. `MOBILES.md` reste centré sur la séquence mobile vs web et sur l'admin mobile (§ 2).

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
- **OTA** : `make mobile-upload-all` + install Samsung — **[DISTRIBUTION-CHANNELS.md](../operations/DISTRIBUTION-CHANNELS.md)**.

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

Doc détaillée : **[PASS-DIGITAL-ASSET-LINKS.md](PASS-DIGITAL-ASSET-LINKS.md)** (étendu à toute la suite).

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

Détail ops : [`DISTRIBUTION-CHANNELS.md`](../operations/DISTRIBUTION-CHANNELS.md) · [`DEPLOY-MATRIX.md`](../operations/DEPLOY-MATRIX.md).

---

## 8. Checklist d’avancement (à cocher)

- [ ] Choisir stack par défaut (Flutter vs PWA vs mixte).
- [x] Cible `make run-mobile APP=…` (`scripts/run-mobile.sh`) — **Admin** exécutable d’office ; les autres dès qu’un dossier Flutter correspondant existe (voir tableau § 5).
- [x] OTA HTTPS : gateway + UI `/4dm1n` → Déploiements + `make mobile-upload-all` (voir § 7).
- [ ] Pipeline build iOS/Android (CI) — en local : **`make test-mobile-suite`** (ou Photos / Drive seuls) + phase 5 de **`make tests`** (ADB optionnel).
- [ ] Publication stores (comptes, politique confidentialité).
- [ ] **ADM-02** : MVP admin mobile après stabilisation ADM-01 web.

---

*Fichier : `docs/produit/MOBILES.md`. Dernière révision : 2026-08-28.*
