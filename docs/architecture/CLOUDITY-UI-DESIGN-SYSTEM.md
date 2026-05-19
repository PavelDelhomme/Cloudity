# Moteur UI Cloudity — `@cloudity/ui` (design system)

**Rôle** : définir un **moteur UI partagé** pour toutes les applications web Cloudity (suite `/app/*`, admin `/4dm1n`, futures apps Vite séparées), distinct des helpers **API/auth** déjà dans `@cloudity/shared`.

**Liens** : **[ARCHITECTURE-FRONTENDS.md](ARCHITECTURE-FRONTENDS.md)** · **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)** § 5 · **STATUS.md** § 0b (**A4**) · **TODOS.md** § MAINTENANT.

---

## État actuel (mai 2026)

| Package | Contenu | Limite |
|---------|---------|--------|
| **`@cloudity/shared`** | `apiFetch`, JWT, `PageLayout`, `Button`, `Card`, `Input`, tables admin… | UI **mélangée** avec l’API ; un seul fichier **`PageLayout.tsx`** (~130 lignes) ; styles **Tailwind en dur** ; pas de tokens ni thème unifié avec Mail/Drive (souvent classes `brand-*` locales). |
| **`cloudity-web`** | Pages métier (`MailPage`, `DrivePage`, …) | Duplication chrome (barres, modales, listes) ; refactors lourds par module. |

**Conclusion** : oui, il faut un **package UI dédié** — pas « tout réécrire d’un coup », mais **extraire et formaliser** progressivement.

---

## Cible : `@cloudity/ui`

| Principe | Détail |
|----------|--------|
| **Nom npm** | `@cloudity/ui` — workspace `frontend/packages/cloudity-ui` |
| **`@cloudity/shared`** | Reste **sans composants visuels** à terme (API, auth, jwt, `adminUiPath`) |
| **Stack** | React 18, **Tailwind** (preset partagé), **lucide-react** en peer, mode sombre |
| **Consommateurs** | `cloudity-web` aujourd’hui ; demain `web-admin`, shells séparés |

### Périmètre v1 (MVP design system)

1. **Tokens** — couleurs (`brand`, surfaces, bordures), rayons, espacements, typo (CSS variables ou `tailwind.preset.js`).
2. **Primitives** — `Button`, `Input`, `Label`, `Badge`, `Card`, `Spinner`, `IconButton`.
3. **Layout** — `PageLayout`, `PageHeader`, `Stack`, `SidebarShell` (sans logique Mail).
4. **Feedback** — `Toast` (wrapper react-hot-toast), `EmptyState`, `ErrorState`.
5. **Data display** — `Table` (wrapper actuel), `DataList` simple.
6. **Documentation** — Storybook **ou** page `/dev/ui` dans l’app (privée admin).

### Hors périmètre v1 (reste dans les features)

- `MailPageChrome`, composeur mail, arborescence Drive, éditeur Office.
- Logique métier, appels API, hooks domaine.

---

## Phases d’implémentation

| Phase | Livrable | Critère de fin |
|-------|----------|----------------|
| **UI-0** | Ce doc + cases **TODOS** / **BACKLOG** **UI-DS-01** | Alignement équipe |
| **UI-1** | Package `cloudity-ui` + preset Tailwind + réexport temporaire depuis `@cloudity/shared` (deprecated re-exports) | `make test-dashboard` vert |
| **UI-2** | Migrer **admin** (`/4dm1n`) sur `@cloudity/ui` | Aucun import `Button` depuis `PageLayout.tsx` côté admin |
| **UI-3** | Migrer **Pass** + **Settings** | Moins de classes Tailwind dupliquées |
| **UI-4** | **App chrome** partagé (`AppLayout` tokens) + hub `/app` | Cohérence visuelle suite |
| **UI-5** | Migrer **Mail** / **Drive** par blocs (chrome d’abord) | Pas de régression E2E mail |
| **UI-6** | Storybook ou catalogue ; semver **0.2.0** | Doc consommateur |

---

## Règles de contribution

- **Un composant = un fichier** sous `packages/cloudity-ui/src/components/`.
- **Pas de fetch** dans `@cloudity/ui` (zéro dépendance à la gateway).
- **Accessibilité** : focus visible, `aria-*` sur boutons et champs.
- **Dark mode** : classes `dark:` systématiques sur les primitives.
- **Breaking change** : bump semver + note dans `packages/cloudity-ui/CHANGELOG.md`.

---

## Relation multi-apps / Portainer

Le design system **ne change pas** le déploiement : une image `cloudity-web` peut embarquer `@cloudity/ui` en workspace. Les futures apps (**A5/A6** STATUS) consommeront la **même version** de `@cloudity/ui` via le lockfile racine `frontend/`.

---

## Branche de travail

Chantier Git : **`feat/cloudity-ui-design-system`** (après merge doc sur `dev`).
