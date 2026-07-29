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

Mesures dépôt (octets sources, hors `node_modules`). Catalogue runtime :  
`frontend/apps/cloudity-web/src/hub/appsCatalog.ts` (+ tests `appsCatalog.test.ts`).

#### Dossiers `pages/app/*` (encore dans le shell)

| Dossier | Fichiers | Taille (KiB) | Route(s) | Cible workspace | Statut |
|---------|----------|--------------|----------|-----------------|--------|
| `hub/` | 2 | 6,9 | `/app` (index) | — | **hub-only** ✓ |
| `drive/` | 4 | 200,6 | `/app/drive` · `/app/corbeille` → `drive?view=trash` | `@cloudity/web-drive` | embedded |
| `office/` | 3 | 108,3 | `/app/office` · `/app/office/editor/:nodeId` | `@cloudity/web-office` | embedded |
| `pass/` | 21 | 131,3 | `/app/pass` | `@cloudity/web-pass` | embedded |
| `photos/` | 9 | 138,3 | `/app/photos` | `@cloudity/web-photos` | embedded |
| `calendar/` | 4 | 46,9 | `/app/calendar` | `@cloudity/web-calendar` | embedded |
| `contacts/` | 4 | 41,6 | `/app/contacts` | `@cloudity/web-contacts` | embedded |
| `settings/` | 13 | 58,4 | `/app/settings` · `/app/settings/sec/:token` · `…/canonical` | shell → `web-profile` | **shell** |
| `notes/` | 4 | 22,7 | `/app/notes` | `@cloudity/web-notes` | embedded |
| `tasks/` | 4 | 28,0 | `/app/tasks` | `@cloudity/web-tasks` | embedded |
| *(fichiers racine `pages/app/`)* | ~14 | ~48 | helpers vault Drive/Photos | redistribuer au split | transversal |

**`pages/app/mail/`** : **supprimé** — code dans `frontend/apps/web-mail/` (**25** fichiers, **~449 KiB** ; `MailPage.tsx` ≈ 7 362 lignes).

#### API

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `src/api.ts` | ~1 952 | Barrel (admin, drive, pass…) + `export * from './apiMail'` |
| `src/apiMail.ts` | ~839 | Client Mail utilisateur `/mail/me/*` (évite conflit `api.ts` / dossier `api/`) |

#### Routes shell (`App.tsx`) ↔ inventaire hub

| Path | Qui sert |
|------|----------|
| `/`, `/login`, `/register` | shell eager |
| **`/app`** | **`AppHub`** — grille de **liens uniquement** (pas de `useQuery` / pas de fetch métier) |
| `/app/mail` | **DEV** : lazy `@cloudity/web-mail` · **PROD** : redirect → SPA `/app/mail/` |
| `/app/drive` `/office` `/pass` `/calendar` `/notes` `/tasks` `/contacts` `/photos` | lazy `pages/app/*` |
| `/app/settings*` | shell settings |
| `/4dm1n` | `admin.html` |

`HUB_INVENTORY_ROUTES` dans `appsCatalog.ts` = liste machine des href launcher.

#### Règle hub (gelée)

1. `/app` = **launcher** : icône + nom + courte description + lien.  
2. **Interdit** dans `AppHub` : API Mail/Drive/Calendar, aperçus non lus, listes récentes.  
3. Source des liens : `HUB_LAUNCHER_APPS`.  
4. **Note Pilotage** : prochain Focus après FE-SPLIT-01 = **H19**.

#### Checklist FE-HUB-01

| Critère | État |
|---------|------|
| Lire `MULTI-APPS-WEB-MOBILE.md` | ☑ (validé Pilotage) |
| Inventaire `pages/app/*` (taille / routes) | ☑ **ce §** + `HUB_INVENTORY_ROUTES` |
| Hub `/app` = grille liens uniquement | ☑ `AppHub.tsx` + tests anti-métier |
| Note prochain = **FE-SPLIT-01** | ☑ |

### 2.3 FE-SPLIT-01 — Mail autonome (**livré** 2026-07-29)

| Élément | Détail |
|---------|--------|
| Package | `frontend/apps/web-mail` (`@cloudity/web-mail`) |
| Entry SPA | `src/main.tsx` + `MailShellLayout.tsx` · `base: '/app/mail/'` · port Vite 3001 |
| Build | `npm run build -w @cloudity/web-mail` → `dist/` |
| Nginx | `location ^~ /app/mail` → `/app/mail/index.html` |
| Dockerfile | build web + web-mail ; copy dist → `/usr/share/nginx/html/app/mail` |
| Hub | `hosting: 'external'`, `href: '/app/mail/'` |
| Shell PROD | `ExternalMailRedirect` + lien drawer `<a href="/app/mail/">` |
| Shell DEV | lazy `@cloudity/web-mail` (même process Vite `:6001`) |

#### Checklist FE-SPLIT-01

| Critère | État |
|---------|------|
| Scaffold + workspace npm | ☑ |
| Migrer pages/libs Mail + `apiMail.ts` | ☑ |
| Entry Vite + nginx + Dockerfile | ☑ |
| Hub `external` + smoke build | ☑ `vite build` OK |

### 2.3bis Phases (Pilotage)

| ID | Étape | Done quand |
|----|--------|------------|
| **FE-HUB-01** | Doc + inventaire + hub liens-only | **Livré** |
| **FE-SPLIT-01** | Mail = app workspace autonome (`web-mail` entry + nginx) | **Livré** — cocher Pilotage puis Focus **H19** |
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

1. **FE-HUB-01** — ☑ (§ 2.2bis).  
2. **FE-SPLIT-01** — ☑ Mail autonome (§ 2.3).  
3. **H19** — SessionStore + LoginScreen → `cloudity_shared` — **Focus Pilotage suivant**.  
4. **MOBILE-DA-01** — checklist DA Flutter.  
5. **H21** → **UI-DS-REMAIN** → **H14** (HTTPS VPS).

Validation : `/4dm1n/pilotage` → Sync docs → cocher **FE-SPLIT-01** → Focus **H19**.

---

## 5. Liens

| Sujet | Doc |
|-------|-----|
| Layout pages actuelles | [FRONTEND-LAYOUT.md](FRONTEND-LAYOUT.md) |
| Design system web | [CLOUDITY-UI-DESIGN-SYSTEM.md](CLOUDITY-UI-DESIGN-SYSTEM.md) |
| Versions packages | [../operations/VERSIONS-PROJET.md](../operations/VERSIONS-PROJET.md) |
| Chemin ops | [../operations/DEPLOIEMENT.md](../operations/DEPLOIEMENT.md) |

*2026-07-29 — priorité produit structurelle.*
