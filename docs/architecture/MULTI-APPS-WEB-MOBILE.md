# Multi-apps — Hub web + DA Flutter commune

**Priorité immédiate** (avant Portainer / H14 HTTPS VPS).  
Index : [`../README.md`](../README.md) · Ops : [`../operations/DEPLOIEMENT.md`](../operations/DEPLOIEMENT.md) · Pilotage : **FE-HUB-01**, **FE-SPLIT-01**, **H19**, **MOBILE-DA-01**.

---

## 1. Problème actuel

### Web (`frontend/apps/cloudity-web`)

| Constat | Impact |
|---------|--------|
| **Une seule** app Vite/React contient Hub + Mail + Drive + Pass + Photos + Office + admin + login… | Bundle énorme (`api.ts` ~2,8k lignes), build lent, memory, indéchiffrable |
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

### 2.3 Phases (Pilotage)

| ID | Étape | Done quand |
|----|--------|------------|
| **FE-HUB-01** | Documenter + geler la règle « hub only » ; inventaire routes monolithe ; hub = seule entrée produit | Doc + checklist Pilotage |
| **FE-SPLIT-01** | Extraire **1ère** app (Mail recommandé) vers `frontend/apps/web-mail` + lien depuis hub | `make deploy-web` + smoke `/app/mail` |
| **FE-SPLIT-02** | Drive puis Pass (même pattern) | 3 apps hors monolithe |
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

1. **FE-HUB-01** — figer la cible hub (ce doc) + inventaire monolithe.  
2. **H19** — SessionStore + LoginScreen → `cloudity_shared` ; migrer Mail + Drive.  
3. **MOBILE-DA-01** — checklist DA + brancher toutes les apps sur tokens / shell.  
4. **FE-SPLIT-01** — extraire `web-mail`.  
5. Ensuite seulement : reprise **H14** / Portainer (prod VPS).

Validation : **Pilotage** `/4dm1n/pilotage` — Sync docs, Focus sur **FE-HUB-01**.

---

## 5. Liens

| Sujet | Doc |
|-------|-----|
| Layout pages actuelles | [FRONTEND-LAYOUT.md](FRONTEND-LAYOUT.md) |
| Design system web | [CLOUDITY-UI-DESIGN-SYSTEM.md](CLOUDITY-UI-DESIGN-SYSTEM.md) |
| Versions packages | [../operations/VERSIONS-PROJET.md](../operations/VERSIONS-PROJET.md) |
| Chemin ops | [../operations/DEPLOIEMENT.md](../operations/DEPLOIEMENT.md) |

*2026-07-29 — priorité produit structurelle.*
