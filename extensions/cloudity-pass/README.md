# Cloudity Pass — Extension navigateur (Manifest V3)

> **Statut** : 🟡 squelette livré le **2026-05-13** (J7 ter sprint Pass).
> Build OK, popup et options fonctionnels en local. **MP-06 + MP-07 livrés le
> 2026-05-21** : domain matcher, déchiffrement des items, candidats par
> domaine, autofill username/password au clic utilisateur et E2E Chromium avec
> extension chargée.

## Sommaire

* [Pourquoi cette extension ?](#pourquoi)
* [Architecture (MV3)](#archi)
* [Build & installation locale](#build)
* [Modèle de menace](#menace)
* [Roadmap (MP-06 et au-delà)](#roadmap)

## Pourquoi cette extension ? <a id="pourquoi"></a>

Pour rivaliser avec Proton Pass / Bitwarden / 1Password, il faut une
extension qui propose les identifiants en un clic depuis le coffre
Cloudity. Cette extension est le **3e client** de
`@cloudity/pass-crypto` (web ✓, mobile ✓, extension 🟡), et reposera
sur le **même format `EnvelopeV1`** — donc interopérable bit-à-bit.

Ce squelette livre :

* `manifest.json` MV3 minimal (permissions `storage`, `activeTab`,
  `scripting`, `alarms` — pas de `host_permissions: <all_urls>` global) ;
* un **service worker** `background/` qui garde la master key en
  mémoire et applique l'**auto-lock 5 min** identique à
  `mobile/pass/lib/vault_controller.dart` ;
* un **content script** qui détecte les champs login, affiche un badge
  discret quand le coffre est déverrouillé, liste les entrées candidates
  du domaine et remplit username/password après clic utilisateur ;
* un **popup** de connexion + déverrouillage maître ; la dérivation
  Argon2id et la master key vivent dans le service worker uniquement ;
* une page **options** pour configurer l'URL du gateway Cloudity ;
* un **build esbuild** (`npm run build` / `npm run watch`).

## Architecture (MV3) <a id="archi"></a>

```
extensions/cloudity-pass/
├── manifest.json              # MV3, CSP stricte, permissions minimales
├── package.json               # @cloudity/pass-extension v0.1.0
├── tsconfig.json              # ESNext / bundler / strict
├── scripts/build.mjs          # esbuild bundler + copie statiques
├── icons/                     # PNG 16/32/48/128 (à fournir — voir TODO)
└── src/
    ├── background/index.ts    # service worker : état du coffre, auto-lock
    ├── content/index.ts       # détection champs login, ping background
    ├── popup/
    │   ├── popup.ts           # logique UI déverrouillage/verrouillage
    │   └── static/            # popup.html + popup.css
    └── options/
        ├── options.ts         # logique paramètres
        └── static/            # options.html + options.css
```

**Garanties d'isolation** :

* La **master key** ne sort jamais du `service_worker`. Le popup et le
  content script communiquent par `chrome.runtime.sendMessage` et ne
  voient que des booléens (`{ unlocked: true }`).
* `chrome.storage.local` ne contient que des **métadonnées non
  sensibles** : URL gateway, `userId` Cloudity, préférences UX.
* `web_accessible_resources: []` → aucune ressource n'est accessible
  depuis la page web visitée.
* CSP `default-src 'self'` + `wasm-unsafe-eval` (uniquement pour
  Argon2id WASM via `hash-wasm` quand `@cloudity/pass-crypto` sera
  branché en MP-06).

## Build & installation locale <a id="build"></a>

```bash
cd extensions/cloudity-pass
npm install
npm test            # domain matcher MP-06
npm run build       # produit dist/
```

Test E2E Chromium de l’autofill extension :

```bash
make test-e2e-playwright-pass-extension
```

Ce test charge `dist/` dans Chromium, crée une entrée Pass via l’UI web, déverrouille le service worker, ouvre une page de login synthétique et vérifie le remplissage après clic sur le badge Cloudity.

Puis dans Chrome / Edge :

1. `chrome://extensions/`
2. Activer le mode développeur
3. *Charger l'extension non empaquetée* → choisir
   `extensions/cloudity-pass/dist`

Pour le développement avec rebuild automatique :

```bash
npm run watch
```

Recharger l'extension via le bouton 🔄 de `chrome://extensions` après
chaque rebuild.

> **Icônes manquantes** : le squelette ne fournit pas de PNG. Au
> premier `npm run build`, le script affiche un avertissement clair.
> Ajoute des PNG `16/32/48/128` dans `icons/` et relance.

## Modèle de menace <a id="menace"></a>

| Vecteur | Mitigation |
|---|---|
| Page web malveillante lit le DOM | content script ne remplit rien avant déverrouillage + clic utilisateur ; aucune donnée n’est stockée durablement dans le DOM. |
| Sniff inter-extension via `chrome.runtime.connectExternal` | non utilisé (pas de `externally_connectable`). |
| Persistance de la master key | inexistante : `chrome.storage` ne reçoit que des métadonnées ; le service worker `zeroize` la clé sur lock + à la fermeture. |
| Auto-lock contourné par suspension MV3 | `chrome.alarms` réveille le service worker à l'échéance. |
| Replay XSS sur un site visité | CSP stricte sur les pages d'extension, et l'autofill (MP-06) **ne renverra jamais** les valeurs au site sans interaction utilisateur explicite. |

Voir aussi :

* [`docs/securite/PASS-CRYPTO.md`](../../docs/securite/PASS-CRYPTO.md)
  — format `EnvelopeV1` et hiérarchie de clés.
* [`docs/securite/URL-CAPABILITIES.md`](../../docs/securite/URL-CAPABILITIES.md)
  § 7 — couverture sécurité des clients (web / mobile / extension).

## Roadmap <a id="roadmap"></a>

| ID | Tâche | État |
|---|---|---|
| **MP-01** (livré 2026-05-13) | Squelette MV3 (manifest, popup, background, content, options, build esbuild) | ✅ |
| **MP-06** (2026-05-21) | `@cloudity/pass-crypto` dans le service worker ; appels gateway `/pass/vaults` + items ; déchiffrement local ; filtrage domaine ; menu candidats ; autofill au clic | ✅ initial |
| **MP-07** (2026-05-21) | Tests Playwright extension (Chromium headless avec `--load-extension`) : création entrée web, déverrouillage extension, candidat domaine, autofill après clic | ✅ |
| **Pass L3 popup** (2026-05-21) | Liste entrées pour l’onglet actif, filtre, copie, « Remplir l’onglet » (`fill-active-tab`) | ✅ partiel |
| **MP-08** | Portage **Firefox** (manifest MV3 cross-browser) puis **Safari** (wrapper Xcode) | ⏳ |

Suivi : [`BACKLOG.md`](../../BACKLOG.md) (entrée
*Sprint Pass — L2 extension*) et
[`docs/produit/MULTI-PLATEFORME.md`](../../docs/produit/MULTI-PLATEFORME.md)
(matrice multiplateforme).
