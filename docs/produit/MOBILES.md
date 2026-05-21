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
| **Mail** | APP-01 | Oui (prioritaire) | Oui (`mobile/mail`) | Connexion ; multi-boîtes ; dossiers ; **PJ** partageables ; **nouveau message** (SMTP via gateway) ; lu ; **sync IMAP périodique in-app + bannière nouveaux mails** ; `flutter test` (validation + widget). **Push système (FCM/APNs/Linux desktop notifications)** et brouillon serveur = plus tard — **[TESTS.md](../operations/TESTS.md)** § 1b |
| **Drive** | APP-02 | Oui | Oui (`mobile/drive`) | MVP mobile : liste racine + dossiers (`GET /drive/nodes`) ; `make run-mobile APP=Drive` ; **`make test-mobile-drive`** ou phase 5 **`make test-mobile-suite`** / **`make tests`** — **[TESTS.md](../operations/TESTS.md)** § 1b |
| **Office** | APP-03 | Oui (édition complète) | Viewer + édition légère (cible) | Parité complète difficile sur petit écran — prioriser lecture + commentaires |
| **Pass** | APP-04 | Oui | **MVP lecture seule livré (J7 sprint Pass 2026-05-13)** | `mobile/pass/` Flutter `cloudity_pass` v0.1.0 — Android + Linux desktop. Port Dart `pass_crypto.dart` bit-à-bit interop avec `@cloudity/pass-crypto` web (Argon2id `cryptography`, HKDF-SHA-256, XChaCha20-Poly1305, CBOR). 5 écrans (login → unlock → vaults → items → détail). Auto-lock 5 min + lock à chaque pause/background, MK uniquement en mémoire, `zeroize` au lock. Copie auto-clear 30 s. **21/21 tests Flutter** dont 5 cross-stack web→mobile rejouant le vecteur figé. **Édition = L2 (J+1..J+5)**. Auto-fill OS / extension navigateur en L2/L3 — **ROADMAP APP-04**, **BACKLOG** « Sprint fin mai 2026 » |
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

État actuel (2026-05-21) :

- **Tenant masqué côté mobile** : les apps utilisent `tenant_id=1` en dev local ; la cible produit est la résolution tenant par e-mail côté auth-service (ROADMAP APP-00).
- **Gateway auto en dev** : intégration USB via `adb reverse` → `http://127.0.0.1:6080`; émulateur → `http://10.0.2.2:6080`.
- **Compte démo debug** : builds debug préremplissent `admin@cloudity.local` / `Admin123!` pour ne pas bloquer les validations locales. À ne jamais activer en release.
- **Limite technique importante** : `flutter_secure_storage` et `SharedPreferences` sont isolés par package Android. Les clés `cloudity_suite_*` harmonisent les noms, mais **ne suffisent pas** à partager un refresh token entre `fr.cloudity.cloudity_drive`, `fr.cloudity.cloudity_photos`, etc.

Chantier requis pour le vrai partage sécurisé :

1. **Android AccountManager** ou **Cloudity Auth Broker** signé avec le même certificat que les apps Cloudity.
2. Stocker refresh token / compte dans un stockage OS partagé, protégé par Keystore/biométrie si nécessaire.
3. Les apps consommatrices demandent un token via broker : sélection compte existant, ajout compte, création compte.
4. iOS équivalent : Keychain Access Group + Associated Domains.

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

Variables utiles en dev : `VITE_API_URL` côté web ; côté mobile Flutter, configurer l’URL du **gateway** — **émulateur** `http://10.0.2.2:6080` ; **téléphone USB** `adb reverse tcp:6080 tcp:6080` puis `http://127.0.0.1:6080` (priorité dans `SessionStore.gatewayCandidates`). Erreurs réseau brutes (`errno = 101`, timeout, refus) → message lisible via `cloudity_shared` **`friendlyNetworkMessage`** sur les écrans de connexion. **SDK Arch (`/usr/lib/flutter`) en lecture seule** : `make run-mobile` échoue tant que Gradle ne peut pas écrire sous `flutter_tools/gradle` — soit `sudo chown -R "$(whoami)" /usr/lib/flutter`, soit Flutter clone dans `$HOME` puis **`export FLUTTER_ROOT="$HOME/flutter"`** et **`export PATH="$FLUTTER_ROOT/bin:$PATH"`** (honoré par `scripts/run-mobile.sh` et `test-mobile-app.sh`).

**Note** : `make init-mobile` parcourt aussi `mobile/contacts`, `mobile/photos`, `mobile/pass` lorsqu’ils existent. Suite produit : **[SYNC-BACKLOG.md](SYNC-BACKLOG.md)** (scaffold + CI).

### USB / ADB : appareil `unauthorized`

Si `adb devices` affiche `unauthorized` à côté du téléphone :

1. **Déverrouillez l’écran** du téléphone : une fenêtre **« Autoriser le débogage USB ? »** doit apparaître — cochez **Toujours autoriser** pour cet ordinateur puis **OK** (empreinte RSA).
2. Si rien n’apparaît : **Paramètres → Options pour les développeurs** → **Révoquer les autorisations de débogage USB**, débranchez/rebranchez le câble, relancez `adb devices`.
3. Câble / mode USB : préférez **Transfert de fichiers (MTP)** et un câble **données** (certains câbles ne font que la charge).
4. En dernier recours : `adb kill-server` puis `adb start-server`, puis reconnecter le téléphone.

Tant que l’état reste `unauthorized`, **`flutter run` ne pourra pas installer** l’app sur l’appareil.

---

## 6. Checklist d’avancement (à cocher)

- [ ] Choisir stack par défaut (Flutter vs PWA vs mixte).
- [x] Cible `make run-mobile APP=…` (`scripts/run-mobile.sh`) — **Admin** exécutable d’office ; les autres dès qu’un dossier Flutter correspondant existe (voir tableau § 5).
- [ ] Premier client mobile (souvent **Pass** ou **Mail** selon priorité ROADMAP).
- [ ] Pipeline build iOS/Android (CI) — en local : **`make test-mobile-suite`** (ou Photos / Drive seuls) + phase 5 de **`make tests`** (ADB optionnel).
- [ ] Publication stores (comptes, politique confidentialité).
- [ ] **ADM-02** : MVP admin mobile après stabilisation ADM-01 web.

---

*Fichier : `docs/produit/MOBILES.md`. Dernière révision : 2026-04-17.*
