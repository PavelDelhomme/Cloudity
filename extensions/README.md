# Cloudity — Extensions navigateur

Ce dossier regroupe les **extensions navigateur** du projet Cloudity.
Chaque sous-dossier est un projet npm autonome avec son `package.json`,
son `manifest.json` (MV3) et son build (esbuild ou Vite).

| Extension | Statut | Cible | Description |
|---|---|---|---|
| `cloudity-pass/` | 🟡 MVP local (2026-05-15) | Chrome / Edge / Firefox (MV3) | **Connexion** `POST /auth/login` (tokens `chrome.storage.session`) → sonde **`GET /pass/vaults`** → UI **init** / **unlock** maître (Argon2id `desktop`, `@cloudity/pass-crypto` dans le service worker). Host `http(s)://*/*` pour joindre le gateway. Autofill liste entrées = MP-06. |
| `cloudity-pass-firefox/` | 🟡 MP-08 initial | Firefox | Build dérivé Chrome + `manifest.firefox.json` (`make build-pass-extension-firefox`) |
| `cloudity-pass-safari/` | ❌ non démarré | Safari | Wrapper Xcode (Web Extensions API) — chantier mois suivant |

Voir [`docs/produit/MULTI-PLATEFORME.md`](../docs/produit/MULTI-PLATEFORME.md)
pour la matrice transversale apps × plateformes.

## Conventions communes

* **Manifest V3** uniquement.
* Le build produit `dist/` (gitignoré). **`make build-pass-extension`** ou **`make up` / `make rebuild`** lancent `npm install` + `npm run build` dans `extensions/cloudity-pass/`.
* Les secrets utilisateurs (master key, JWT) ne sortent **jamais** de
  la mémoire du `service_worker` background. `chrome.storage.local`
  ne contient que des **métadonnées non sensibles** (URL gateway,
  préférences UX).
* Les helpers crypto utilisent **`@cloudity/pass-crypto`** via le
  workspace npm racine, pour garantir l'**interopérabilité bit-à-bit**
  avec le web et le mobile.
