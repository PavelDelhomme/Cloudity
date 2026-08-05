# Architecture des frontends Cloudity

> **Priorité immédiate (cible hub + DA)** → **[MULTI-APPS-WEB-MOBILE.md](MULTI-APPS-WEB-MOBILE.md)** · Pilotage **FE-HUB-01** / **FE-SPLIT-01** / **H19** / **MOBILE-DA-01**.  
> Autres liens : [STATUS.md](../../STATUS.md) · [ROADMAP.md](../produit/ROADMAP.md) · [MOBILES.md](../produit/MOBILES.md) · [README.md](../README.md).

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
