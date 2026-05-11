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

---

*À mettre à jour lors d’un nouveau découpage (ex. sous-composants Office).*
