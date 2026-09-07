# Frontends Cloudity (fiche unique)

> Hub web + DA Flutter (priorité) : [`MULTI-APPS-WEB-MOBILE.md`](MULTI-APPS-WEB-MOBILE.md) · Design tokens : [`CLOUDITY-UI-DESIGN-SYSTEM.md`](CLOUDITY-UI-DESIGN-SYSTEM.md).

## Sommaire

1. [Layout frontend](#layout-frontend)
2. [Architecture frontends](#architecture-frontends)
3. [UI cross-platform](#ui-cross-platform)

---

# Layout frontend

## Frontend `cloudity-web` — arborescence des pages

> **Cible** : ce monolithe devient un **hub** — voir **[MULTI-APPS-WEB-MOBILE.md](MULTI-APPS-WEB-MOBILE.md)** (Pilotage **FE-HUB-01** / **FE-SPLIT-01**). Les dossiers `pages/app/<domaine>/` ci-dessous décrivent l’**état actuel** ; à terme chaque domaine = app `frontend/apps/web-*`.

**Rôle** : décrire où placer les écrans React sous `frontend/apps/cloudity-web/src/pages/` pour éviter l’amas à plat dans `pages/` vs `pages/app/`.

## 1. Principes

| Zone | Contenu |
|------|---------|
| **`pages/public/`** | Pages **sans auth** : landing, **LoginPage**, **RegisterPage**, tests associés (`LoginPage.test.tsx`). |
| **`pages/auth/`** | Formulaires ou écrans d’auth **hors flux principal** (ex. `Login.tsx` hérité / outils internes). |
| **`pages/admin/`** | Back-office **`/4dm1n`** : tableau de bord, tenants, utilisateurs, coffres admin, domaines mail, CVE, paramètres admin. |
| **`pages/app/<domaine>/`** | Applications **utilisateur** derrière **`/app`** : une sous-dossier par produit (`hub`, `drive`, `mail`, `office`, `pass`, …). |

Le routeur principal reste dans **`src/App.tsx`** (shell utilisateur) et **`src/AdminApp.tsx`** (bundle admin).

## 2. Carte des dossiers `pages/app/`

| Dossier | Pages |
|---------|--------|
| **`hub/`** | Hub d’accueil (`AppHub`) — **launcher only** (FE-HUB-01), catalogue `src/hub/appsCatalog.ts`. |
| **Mail** | **FE-SPLIT-01** → `frontend/apps/web-mail` (`@cloudity/web-mail`) : **DEV** lazy shell · **PROD** SPA `/app/mail/`. |
| **Drive** | **FE-SPLIT-02** → `frontend/apps/web-drive` (`@cloudity/web-drive`) : **DEV** lazy shell · **PROD** SPA `/app/drive/`. |
| **`pass/`** | Pass (encore embedded — FE-SPLIT suivant). |
| **`office/`** | Liste Office + **éditeur de documents** (`OfficePage`, `DocumentEditorPage`) — à terme : sous-modules `word/`, `spreadsheet/`, `presentation/` si le fichier `DocumentEditorPage.tsx` est découpé. |
| **`pass/`** | Coffre mots de passe utilisateur. |
| **`calendar/`**, **`notes/`**, **`tasks/`**, **`contacts/`**, **`photos/`** | Apps correspondantes (`photosTypes.ts` reste à côté de `PhotosPage.tsx`). |
| **`settings/`** | **Paramètres du compte** dans l’app utilisateur (`AppSettingsPage`) — distinct des **`pages/admin/Settings`**. |

## 3. Fichiers à la racine de `src/`

Restent à la racine **`src/`** (hors `pages/`) : **`App.tsx`**, **`AdminApp.tsx`**, **`api.ts`**, contextes (`authContext`, `UploadProvider`, …), **`layouts/`**, **`components/`** transverses, **`utils/`**, **`lib/`** (helpers non UI). Une extraction future possible : `src/features/…` ou `src/modules/…` — à cadrer avec **FRONTENDS.md**.

## 4. Tests frontend — colocalisation Vitest

Les tests frontend (`*.test.ts` / `*.test.tsx`) **restent colocalisés** avec
le code testé (convention Vitest / Jest standard, opposée à pytest) :

```
frontend/apps/cloudity-web/src/
  api.ts
  apiMail.ts                    ← domaine Mail (réexporté par api.ts)
  pages/app/hub/
    AppHub.tsx
    AppHub.test.tsx
frontend/apps/web-mail/src/mail/
  MailPage.tsx
  MailPage.test.tsx             ← tests colocalisés avec l’app Mail
```

Avantages :

- Découverte automatique par Vitest (`include: ["src/**/*.test.{ts,tsx}"]`).
- Tests d'un composant remontent et descendent **avec le composant** lors d'un
  refactor (déplacement de dossier).
- Pas besoin d'un dossier `tests/` parallèle qui dérive avec le temps.

## 5. Fichiers source > 1000 lignes — plan de découpage progressif

Constat (audit 13/05/2026, lignes hors `*.test.*`) :

| Fichier | Lignes | Plan de découpe (cible) |
|---------|-------:|--------------------------|
| `pages/app/mail/MailPage.tsx` | **6576** | **Critique** : `MailPage.tsx` (orchestration) + `MailPageChrome.tsx` (déjà séparé) + sous-composants par zone (`MailListPanel`, `MailReadingPanel`, `MailComposer`, `MailFolderTree`) + hooks `useMail*` dans `pages/app/mail/hooks/`. |
| `frontend/apps/web-drive/src/drive/DrivePage.tsx` | 3228 | `DrivePage.tsx` (shell) + `DriveBrowser`, `DriveBreadcrumbs`, `DriveContextMenu`, `DriveUploadOverlay` + hooks. |
| `api.ts` | 2191 | Découpe par **domaine** vers `src/api/` : `auth.ts`, `drive.ts`, `mail.ts`, `pass.ts`, `photos.ts`, `calendar.ts`, `notes.ts`, `tasks.ts`, `contacts.ts`, `office.ts`, `admin.ts`, `performance.ts`, `webauthn.ts`, `index.ts` (re-export pour compat). |
| `pages/app/office/DocumentEditorPage.tsx` | 1388 | Sous-modules `word/`, `spreadsheet/`, `presentation/` (déjà mentionné § 2 de ce doc). |

**Stratégie** : un fichier par PR/commit, validé via :

1. `npm run typecheck` (TS strict, pas de régression de types) ;
2. `npm run test -- --run` (Vitest) ;
3. `npm run e2e` ciblé sur le domaine concerné (Playwright) ;
4. Démonstration à l'écran dans le navigateur (smoke manuel) avant push.

L'ordre conseillé : **`api.ts`** d'abord (impact le plus large, mais découpe
mécanique sans logique UI), **`MailPage.tsx`** ensuite (impact UI fort, à
faire une fois stabilisée la conversation 2FA + Pass).

Voir l'entrée correspondante dans **[../../BACKLOG.md](../../BACKLOG.md)**
(REFACTOR-FE-01..04).

---

*À mettre à jour lors d’un nouveau découpage (ex. sous-composants Office,
extraction `src/api/` par domaine, refactor `MailPage.tsx`).*

---

# Architecture frontends

## Architecture des frontends Cloudity

> **Priorité immédiate (cible hub + DA)** → **[MULTI-APPS-WEB-MOBILE.md](MULTI-APPS-WEB-MOBILE.md)** · Pilotage **FE-HUB-01** / **FE-SPLIT-01** / **H19** / **MOBILE-DA-01**.  
> Autres liens : [STATUS.md](../../STATUS.md) · [ROADMAP.md](../produit/ROADMAP.md) · [MOBILE-PLATEFORME.md](../produit/MOBILE-PLATEFORME.md) · [README.md](../README.md).

## Couches partagées (source unique)

| Couche | Package / dossier | Rôle | Consommateurs |
|--------|-------------------|------|---------------|
| **API & contrats TS** | `@cloudity/shared` (`frontend/packages/cloudity-shared`) | `apiUrl`, `apiFetch`, JWT, **préférences utilisateur** (`userPreferencesTypes`), favicon (`passDomainFromUrl`, `mailFaviconUrl`) | Web (`@cloudity/web`), extension Pass, futurs apps |
| **Design system** | `@cloudity/ui` (`frontend/packages/cloudity-ui`) | Composants React/Tailwind (`Button`, layouts responsive) | Web, futur `web-shell` / apps découplées |
| **Composants transverses web** | `frontend/apps/cloudity-web/src/components/` | UI réutilisable entre apps du monolithe (`SiteFavicon`, …) — migrer vers `@cloudity/ui` quand le cycle de deps le permet | `@cloudity/web` |
| **Crypto métier** | `@cloudity/pass-crypto`, `@cloudity/app-vault-crypto` | Chiffrement E2E Pass / coffres apps | Web, extension, mobile (port Dart miroir) |
| **App web** | `@cloudity/web` (`frontend/apps/cloudity-web`) | Pages produit (`pages/app/*`), routes SPA, `api.ts` (clients HTTP par domaine — à découper) | Déploiement `cloudity-web` |
| **Mobile** | `mobile/cloudity_shared` (Dart) | Miroir Dart des contrats (`user_preferences.dart`, thème, HTTP) | Toutes apps Flutter |
| **Backend** | `backend/*-service` + `api-gateway` | Microservices + auth central | Tous clients |

**Règle** : tout ce qui est identique sur **web + extension + mobile** (types, URLs, clés cache, favicon) vit dans **`@cloudity/shared`** (TS) ou **`mobile/cloudity_shared`** (Dart). Les composants visuels partagés web vont dans **`@cloudity/ui`**. Une modification de DA ou de contrat se fait **une fois** dans le package, puis les apps réexportent ou consomment directement.

### État actuel (monolithique)

**Workspaces npm** : racine **`frontend/package.json`** (`apps/*`, `packages/*`), lockfile **`frontend/package-lock.json`** ; app principale **`@cloudity/web`** dans **`frontend/apps/cloudity-web`** ; partagé **`@cloudity/shared`** (`packages/cloudity-shared`). En local : **`make frontend-install`** ou **`cd frontend && npm install`**. Le service Compose **`cloudity-web`** build avec le contexte **`./frontend`** et le Dockerfile **`apps/cloudity-web/Dockerfile`** (prod) ou **`Dockerfile.dev`** (dev).

**Une seule application Vite/React** (**`frontend/apps/cloudity-web`**) sert encore :

- le site public (landing, login, inscription) ;
- l’**espace utilisateur** (`/app`, Drive, Mail, Calendrier, etc.) ;
- l’**administration** (UI **`/4dm1n`** ; les appels REST admin restent **`/admin/*`** sur la gateway).

C’est volontairement **simple à déployer** (un conteneur, un build) et cohérent avec une **API Gateway** unique qui route vers les microservices (mail, drive, calendrier, …).

**Prochaine étape (cible)** : voir **[MULTI-APPS-WEB-MOBILE.md](MULTI-APPS-WEB-MOBILE.md)** — `cloudity-web` = hub mince ; apps `web-mail`, `web-drive`, … ; DA Flutter + auth dans `cloudity_shared`. Design system web : **[CLOUDITY-UI-DESIGN-SYSTEM.md](CLOUDITY-UI-DESIGN-SYSTEM.md)**.

## Objectif « multi-apps » (web + mobile)

Tu vises :

- des **clients distincts** (web Mail, web Drive, mobile Mail, mobile Pass, …) ;
- des **équipes et cycles de release indépendants** ;
- une **interconnexion** via la même API, SSO (tokens), et éventuellement un **design system** partagé.

### Pistes d’évolution (du plus léger au plus modulaire)

1. **Monorepo (recommandé en premier pas)**  
   - Exemple : `apps/web-shell`, `apps/web-mail`, `packages/ui`, `packages/api-client`.  
   - Outils : **pnpm workspaces**, **Nx** ou **Turborepo**.  
   - Chaque `app` a son `vite.config`, son `package.json`, son déploiement (image Docker ou sous-chemin `/mail` derrière un reverse-proxy).

2. **Micro-frontends (si besoin d’embarquer plusieurs apps dans une même page)**  
   - Module Federation (Vite), single-spa, ou iframe en dernier recours.  
   - Utile surtout si le « hub » doit charger des morceaux d’apps hétérogènes sans tout rebuilder.

3. **Repos séparés**  
   - Quand les équipes et la CI/CD sont mûres ; coût : duplication de tooling, alignement des versions du design system et du client API.

### Principes à garder

- **Backend** : services déjà séparés (mail-directory, calendar-service, …) — c’est la bonne base.  
- **Auth** : un seul fournisseur de tokens (gateway / auth-service) consommé par tous les clients.  
- **Contrats** : schémas OpenAPI ou types partagés dans `packages/api-client` pour éviter les dérives.

### Point d’entrée HTTP

- **Développement Docker** : `http://localhost:6001` → Vite ou nginx selon le service **`cloudity-web`**.  
- Les routes **`/app/...`** sont des routes **SPA** (React Router) : le serveur doit toujours renvoyer **`index.html`** sauf pour les fichiers statiques existants (`nginx.conf` avec `try_files`).

Pour une future **app Mail seule**, tu pourrais exposer `https://mail.cloudity.example` avec la même API et un build `apps/web-mail` minimal.

---

# UI cross-platform

## UI cross-plateforme Cloudity

Cloudity vise **une base commune** avec une **adaptation par appareil** (web large, web mobile, Android, plus tard Linux/Windows). Ce document décrit l’état cible et les conventions partagées.

## Principes

1. **Tokens** — couleurs, espacements, rayons : source unique `mobile/cloudity_shared/assets/cloudity_tokens.json` (à consommer côté Tailwind web et Flutter mobile).
2. **Domaine partagé** — dossiers mail, clés de préférences, libellés (« Programmée », « Dossiers standard », etc.) dans `cloudity_shared`.
3. **Patterns UI** — même structure fonctionnelle : drawer/sidebar (comptes + dossiers), liste → détail, paramètres au même endroit, bannière sync identique.
4. **UI native** — React + `@cloudity/ui` sur web, Material 3 sur mobile ; même vocabulaire, pas copie pixel-par-pixel.

## Mail — clés de préférences

| Clé | Format | Contenu |
|-----|--------|---------|
| Vue boîte/dossier | `cloudity.mail.view.v1:{tenantId}:{email}` | `{ accountId, folder }` |

Web : `mailViewPreferences.ts`. Mobile : `cloudity_shared/mail_view_preferences.dart`.

## Mail — dossiers standard

Définis dans `cloudity_shared/mail_constants.dart` : `inbox`, `sent`, `drafts`, `scheduled`, `archive`, `spam`, `trash`, etc.

## Dates et fuseaux

- L’API renvoie les timestamps en **RFC3339 UTC**.
- Les chaînes PostgreSQL sans fuseau sont interprétées comme UTC (backend `normalizeTimestampString`, frontend `parseCloudityDateTime`).
- Les `<input type="datetime-local">` sont convertis via `datetimeLocalInputToUtcIso` (composants locaux → ISO UTC).
- Affichage : toujours en **fuseau local** de l’appareil (`toLocaleString` / `parseCloudityDateTime().toLocal()`).

## Roadmap

| Phase | Contenu |
|-------|---------|
| **A** | `cloudity_shared` mail + tokens + doc (ce fichier) |
| **B** | Mail mobile : drawer type Photos, paramètres, dossier Programmée |
| **B′** | Calendar, Contacts, Notes, Tasks : MVP liste API + auth suite (`SuiteProductHomeScreen`) |
| **B″** | Drive : écran Paramètres (drawer) |
| **C** | Web Mail → `@cloudity/ui` ; package Flutter `cloudity_widgets` optionnel |

## Références

- Web design system : [CLOUDITY-UI-DESIGN-SYSTEM.md](./CLOUDITY-UI-DESIGN-SYSTEM.md)
- Frontends : [FRONTENDS.md](./FRONTENDS.md)
