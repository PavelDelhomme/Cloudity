# Frontend `cloudity-web` — arborescence des pages

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
| **`hub/`** | Hub d’accueil (`AppHub`). |
| **`drive/`** | Drive. |
| **`office/`** | Liste Office + **éditeur de documents** (`OfficePage`, `DocumentEditorPage`) — à terme : sous-modules `word/`, `spreadsheet/`, `presentation/` si le fichier `DocumentEditorPage.tsx` est découpé. |
| **`pass/`** | Coffre mots de passe utilisateur. |
| **`mail/`** | Mail + chrome (`MailPage`, `MailPageChrome`). |
| **`calendar/`**, **`notes/`**, **`tasks/`**, **`contacts/`**, **`photos/`** | Apps correspondantes (`photosTypes.ts` reste à côté de `PhotosPage.tsx`). |
| **`settings/`** | **Paramètres du compte** dans l’app utilisateur (`AppSettingsPage`) — distinct des **`pages/admin/Settings`**. |

## 3. Fichiers à la racine de `src/`

Restent à la racine **`src/`** (hors `pages/`) : **`App.tsx`**, **`AdminApp.tsx`**, **`api.ts`**, contextes (`authContext`, `UploadProvider`, …), **`layouts/`**, **`components/`** transverses, **`utils/`**, **`lib/`** (helpers non UI). Une extraction future possible : `src/features/…` ou `src/modules/…` — à cadrer avec **ARCHITECTURE-FRONTENDS.md**.

## 4. Tests frontend — colocalisation Vitest

Les tests frontend (`*.test.ts` / `*.test.tsx`) **restent colocalisés** avec
le code testé (convention Vitest / Jest standard, opposée à pytest) :

```
frontend/apps/cloudity-web/src/
  api.ts
  api.test.ts                   ← OK : à côté du fichier testé
  authContext.tsx
  authContext.test.tsx          ← OK
  pages/app/mail/
    MailPage.tsx
    MailPage.test.tsx           ← OK (à créer si manquant)
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
| `pages/app/drive/DrivePage.tsx` | 3228 | `DrivePage.tsx` (shell) + `DriveBrowser`, `DriveBreadcrumbs`, `DriveContextMenu`, `DriveUploadOverlay` + hooks `pages/app/drive/hooks/`. |
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
