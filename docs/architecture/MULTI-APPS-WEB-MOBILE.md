# Multi-apps — Hub web + DA Flutter commune

**Priorité immédiate** (avant Portainer / H14 HTTPS VPS).  
Index : [`../README.md`](../README.md) · Ops : [`../operations/DEPLOIEMENT.md`](../operations/DEPLOIEMENT.md) · Pilotage : **FE-HUB-01**, **FE-SPLIT-01**, **H19**, **MOBILE-DA-01**.

---

## 1. Problème actuel

### Web (`frontend/apps/cloudity-web`)

| Constat | Impact |
|---------|--------|
| **Une seule** app Vite/React contient encore Hub + Drive + Pass + Photos + Office + admin + login… (Mail sorti vers `@cloudity/web-mail`) | Bundle encore lourd ; `api.ts` ~1,9k + `api/mail.ts` ~840 |
| Packages partagés existent déjà (`@cloudity/ui`, `@cloudity/shared`) | Sous-utilisés : le métier reste dans le monolithe |
| Routes `/app/mail`, `/app/drive`, … | Tout dans le même process / même chunking grossier |

**Cible** : `cloudity-web` = **base / hub** (`/`, `/login`, `/app` grille) qui **lance** les apps.  
Chaque produit = **app workspace** séparée (build, mémoire, équipe).

```text
cloudity.localhost:6001/          → site + login (shell)
cloudity.localhost:6001/app       → Hub (liens vers apps)
cloudity.localhost:6001/app/mail  → à terme app @cloudity/web-mail (ou /mail)
… idem Drive, Pass, Photos, …
cloudity.localhost:6001/4dm1n     → admin (app dédiée ou package admin)
```

### Mobile (`mobile/*`)

| Constat | Impact |
|---------|--------|
| `cloudity_shared` a déjà thème, tokens, `SuiteAppShell`, drawer, gateway | **Auth encore copiée** : `lib/auth/session_store.dart` + `login_screen.dart` dans quasi chaque app |
| DA partielle (`cloudity_tokens.json`, `CloudityDesignTokens`, `app_theme.dart`) | Pas encore **une** DA imposée + hooks de personnalisation produit |
| `lib/features/` : Mail/Photos/Pass OK ; Calendar/Contacts/Notes/Tasks **minces** | Apps « MVP » trop vides — normal au début, à remplir **sans** recopier auth/shell |

**Cible** : une **DA commune** (look & feel suite) + **auth/login une seule fois** dans `cloudity_shared`, chaque app ne garde que `features/` métier + accent produit (couleur, logo, home).

---

## 2. Cible web — découpage

### 2.1 Packages (déjà là)

| Package | Rôle |
|---------|------|
| `@cloudity/shared` | API, auth JWT, types, prefs |
| `@cloudity/ui` | Design system React (tokens, layouts, Button…) |
| `@cloudity/pass-crypto` / `app-vault-crypto` | Crypto métier |

### 2.2 Apps (cible monorepo `frontend/apps/`)

| App npm | URL / rôle | Contenu |
|---------|------------|---------|
| **`cloudity-web`** (actuel, à **amaigrir**) | `/`, `/login`, `/register`, **`/app` hub** | Shell + grille apps + liens. **Plus** de pages Mail/Drive/… |
| `web-mail` | `/app/mail` ou `mail.cloudity…` | Uniquement Mail |
| `web-drive` | `/app/drive` | Drive |
| `web-pass` | `/app/pass` | Pass |
| `web-photos` | `/app/photos` | Photos |
| `web-office` | `/app/office` | Office |
| `web-calendar`, `web-notes`, `web-tasks`, `web-contacts` | idem | Apps légères |
| `web-admin` | `/4dm1n` | Back-office (extrait de `AdminApp.tsx`) |
| `web-profile` / settings | `/app/settings` | Profil compte (peut rester dans hub au début) |

**Règle** : une app ne dépend **pas** des pages d’une autre ; seulement de `@cloudity/shared` + `@cloudity/ui`.

### 2.2bis Inventaire monolithe (FE-HUB-01 — **fait** 2026-07-29)

Mesures sur le dépôt (tailles disque / fichiers). Catalogue runtime : `frontend/apps/cloudity-web/src/hub/appsCatalog.ts`.

#### Dossiers `pages/app/*` (encore dans le shell)

| Dossier | Fichiers | Taille | Route(s) | Cible workspace | Statut |
|---------|----------|--------|----------|-----------------|--------|
| `hub/` | 2 | 12 Ko | `/app` (index) | — (shell) | **hub-only** ✓ |
| `drive/` | 4 | 212 Ko | `/app/drive`, `/app/corbeille` → drive?view=trash | `@cloudity/web-drive` | embedded |
| `office/` | 3 | 116 Ko | `/app/office`, `/app/office/editor/:nodeId` | `@cloudity/web-office` | embedded |
| `pass/` | 21 | 172 Ko | `/app/pass` | `@cloudity/web-pass` | embedded |
| `photos/` | 9 | 160 Ko | `/app/photos` | `@cloudity/web-photos` | embedded |
| `calendar/` | 4 | 56 Ko | `/app/calendar` | `@cloudity/web-calendar` | embedded |
| `contacts/` | 4 | 52 Ko | `/app/contacts` | `@cloudity/web-contacts` | embedded |
| `settings/` | 13 | 84 Ko | `/app/settings`, `/app/settings/sec/:token`, `/app/settings/canonical` | shell (puis `web-profile`) | **shell** |
| `notes/` | 4 | 32 Ko | `/app/notes` | `@cloudity/web-notes` | embedded |
| `tasks/` | 4 | 36 Ko | `/app/tasks` | `@cloudity/web-tasks` | embedded |
| *(racine `pages/app/`)* | vault helpers | ~60 Ko | partagé Drive/Photos | à redistribuer au split | transversal |

**`pages/app/mail/`** : **absent** — déplacé vers `frontend/apps/web-mail/` (~516 Ko, 22 fichiers ; `MailPage.tsx` ~7 362 lignes).

#### API

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `src/api.ts` | ~1 952 | Barrel admin / drive / pass / … + `export * from './api/mail'` |
| `src/api/mail.ts` | ~839 | Client Mail utilisateur (`/mail/me/*`) |

#### Routes shell (`App.tsx`)

| Path | Bundle |
|------|--------|
| `/`, `/login`, `/register` | shell (eager) |
| `/app` | **AppHub** — grille liens uniquement (aucun `useQuery` / fetch métier) |
| `/app/mail` | lazy `@cloudity/web-mail` |
| `/app/drive`, `/office`, `/pass`, `/calendar`, `/notes`, `/tasks`, `/contacts`, `/photos` | lazy pages locales |
| `/app/settings*` | shell (settings) |
| `/4dm1n` | `admin.html` (second entry) |

#### Règle hub (gelée)

- `/app` = **launcher** : liens vers apps, zéro logique Mail/Drive/Calendar.
- Source de vérité des liens : `appsCatalog.ts` (`hosting`: `shell` | `embedded` | `external`).
- **Prochain split Pilotage = Mail → FE-SPLIT-01** (SPA autonome + nginx ; aujourd’hui package + lazy).

#### Checklist FE-HUB-01

| Critère | État |
|---------|------|
| Lire / tenir `MULTI-APPS-WEB-MOBILE.md` | ☑ |
| Inventaire `pages/app/*` (taille / routes) | ☑ (ce §) |
| Hub `/app` = grille liens uniquement | ☑ `AppHub.tsx` + tests |
| Note Pilotage : prochain = **FE-SPLIT-01** (Mail) | ☑ (catalogue + ce §) |

### 2.3 Phases (Pilotage)

| ID | Étape | Done quand |
|----|--------|------------|
| **FE-HUB-01** | Doc + inventaire + hub liens-only | **Livré** — cocher dans Pilotage puis Focus **FE-SPLIT-01** |
| **FE-SPLIT-01** | Mail = app workspace autonome (`web-mail` entry + nginx) | smoke `/app/mail` hors monolithe process |
| **FE-SPLIT-02** | Drive puis Pass | 3 apps hors monolithe |
| **FE-SPLIT-N** | Reste + admin | Monolithe = shell mince |

Déploiement interim : **un** conteneur nginx peut encore servir plusieurs builds sous des chemins, ou plusieurs services Compose plus tard.

Réf. historique : [ARCHITECTURE-FRONTENDS.md](ARCHITECTURE-FRONTENDS.md) · [FRONTEND-LAYOUT.md](FRONTEND-LAYOUT.md) · [CLOUDITY-UI-DESIGN-SYSTEM.md](CLOUDITY-UI-DESIGN-SYSTEM.md).

---

## 3. Cible mobile — DA + auth partagées

### 3.1 Déjà dans `cloudity_shared` (réutiliser, ne pas recopier)

- `cloudity_design_tokens.dart` + `assets/cloudity_tokens.json`
- `app_theme.dart` / `CloudityThemedApp`
- `suite_app_shell.dart`, `suite_drawer_scaffold.dart`, `suite_gateway_config.dart`
- `auth_2fa.dart`, passkeys, prefs, crash reporter…

### 3.2 Manque (dette — H19 / MOBILE-DA-01 / AUTH-PKG)

| Élément | Aujourd’hui | Cible |
|---------|-------------|--------|
| `SessionStore` | Copié `lib/auth/` × N apps | **Un** module `cloudity_shared` (paramétrable `productId`) |
| `LoginScreen` | Copié × N | **Un** écran partagé + slots (titre, accent, logo produit) |
| DA stricte | Tokens + thème | Checklist DA : typo, spacing, erreurs, empty states **obligatoires** |
| `lib/features/` | Variable | **Seul** endroit du métier app ; auth/shell **interdits** dedans |

### 3.3 Personnalisation autorisée (par app)

- Couleur accent / logo (tokens `apps.<product>`)
- Home / features métier
- Titre, deep links, permissions

### 3.4 Interdit (copie)

- Refaire login / session / drawer / theme from scratch dans l’app
- Forker `cloudity_shared` « pour aller plus vite »

Voir aussi : [`../../mobile/README.md`](../../mobile/README.md) · [`../produit/MOBILES.md`](../produit/MOBILES.md).

---

## 4. Ordre de travail (immédiat)

1. **FE-HUB-01** — ☑ doc + inventaire + hub liens-only (ce fichier § 2.2bis).  
2. **FE-SPLIT-01** — finir Mail autonome (entry Vite + nginx) — **Focus Pilotage suivant**.  
3. **H19** — SessionStore + LoginScreen → `cloudity_shared`.  
4. **MOBILE-DA-01** — checklist DA Flutter.  
5. **H21** → **UI-DS-REMAIN** → **H14** (HTTPS VPS).

Validation : `/4dm1n/pilotage` → Sync docs → cocher **FE-HUB-01** → Focus **FE-SPLIT-01**.

---

## 5. Liens

| Sujet | Doc |
|-------|-----|
| Layout pages actuelles | [FRONTEND-LAYOUT.md](FRONTEND-LAYOUT.md) |
| Design system web | [CLOUDITY-UI-DESIGN-SYSTEM.md](CLOUDITY-UI-DESIGN-SYSTEM.md) |
| Versions packages | [../operations/VERSIONS-PROJET.md](../operations/VERSIONS-PROJET.md) |
| Chemin ops | [../operations/DEPLOIEMENT.md](../operations/DEPLOIEMENT.md) |

*2026-07-29 — priorité produit structurelle.*
