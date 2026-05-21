---
slug: multi-plateforme
---

# CLOUDITY — Matrice multiplateforme & plan de couverture

> **Rôle** — décrire **toutes les surfaces clientes** par application (web,
> mobile Android/iOS, desktop Linux, extension navigateur), leur **état
> réel** (livré / scaffold / non démarré), et l'**ordre rentable** pour
> combler les manques.
>
> **Complète** : [`MOBILES.md`](./MOBILES.md) (focus mobile vs web),
> [`ROADMAP.md`](./ROADMAP.md) (fonctionnel détaillé par APP-xx),
> [`SPRINT-PASS-2026-05.md`](./SPRINT-PASS-2026-05.md) (sprint en cours).
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
> `MOBILES.md` ou de `ROADMAP.md`, **c'est ici qui fait foi**. On
> recopie ensuite vers les autres docs pour rester cohérent.

---

## 1. Matrice « apps × plateformes »

État au **2026-05-13** (J7 sprint Pass).

| App | Web | Android | iOS | Linux desktop | macOS desktop | Windows desktop | Extension navigateur |
|---|---|---|---|---|---|---|---|
| **Mail** (APP-01)     | ✅ `cloudity-web`            | ✅ `mobile/mail` | 🟡 cible Flutter `ios/` mais non testée | ❌ pas de cible Flutter `linux/` à scaffold | ❌ | ❌ | ⛔ |
| **Drive** (APP-02)    | ✅ `cloudity-web`            | ✅ `mobile/drive` (MVP racine) | 🟡 cible Flutter `ios/` non testée | 🟡 cible `mobile/drive/linux/` scaffoldée mais build Linux jamais validé | 🟡 cible `macos/` scaffoldée jamais validée | 🟡 cible `windows/` scaffoldée | ⛔ |
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
* L'**extension navigateur Pass** vient d'avoir son squelette MV3
  poussé. Pas encore de build / publication.

---

## 2. Pourquoi cette matrice (vs juste MOBILES.md) ?

`MOBILES.md` ne couvre que la dimension **mobile vs web**. La question
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

* [`MOBILES.md`](./MOBILES.md) — focus mobile vs web (séquence
  livraison).
* [`ROADMAP.md`](./ROADMAP.md) — fonctionnel détaillé APP-xx.
* [`SPRINT-PASS-2026-05.md`](./SPRINT-PASS-2026-05.md) — sprint en
  cours, scope L1/L2/L3.
* [`docs/architecture/SERVICES.md`](../architecture/SERVICES.md) —
  conteneurs Docker (backend) — la matrice ci-dessus est côté
  **client** uniquement.
* [`docs/securite/URL-CAPABILITIES.md`](../securite/URL-CAPABILITIES.md)
  § 7 — couverture sécu mobile (parité 2FA).
