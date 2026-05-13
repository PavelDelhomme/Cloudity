# Cloudity — Extensions navigateur

Ce dossier regroupe les **extensions navigateur** du projet Cloudity.
Chaque sous-dossier est un projet npm autonome avec son `package.json`,
son `manifest.json` (MV3) et son build (esbuild ou Vite).

| Extension | Statut | Cible | Description |
|---|---|---|---|
| `cloudity-pass/` | 🟡 squelette (2026-05-13) | Chrome / Edge / Firefox (MV3) | Autofill et accès rapide au coffre `cloudity-pass` |
| `cloudity-pass-firefox/` | ❌ non démarré | Firefox (si divergence requise) | Portage si MV3 cross-browser ne suffit pas |
| `cloudity-pass-safari/` | ❌ non démarré | Safari | Wrapper Xcode (Web Extensions API) — chantier mois suivant |

Voir [`docs/produit/MULTI-PLATEFORME.md`](../docs/produit/MULTI-PLATEFORME.md)
pour la matrice transversale apps × plateformes.

## Conventions communes

* **Manifest V3** uniquement.
* Le build produit `dist/` qui se charge dans Chrome via *Charger
  l'extension non empaquetée* → choisir `extensions/<extension>/dist`.
* Les secrets utilisateurs (master key, JWT) ne sortent **jamais** de
  la mémoire du `service_worker` background. `chrome.storage.local`
  ne contient que des **métadonnées non sensibles** (URL gateway,
  préférences UX).
* Les helpers crypto utilisent **`@cloudity/pass-crypto`** via le
  workspace npm racine, pour garantir l'**interopérabilité bit-à-bit**
  avec le web et le mobile.
