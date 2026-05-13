# Cloudity Pass — Extension navigateur (Manifest V3)

> **Statut** : 🟡 squelette livré le **2026-05-13** (J7 ter sprint Pass).
> Build OK, popup et options fonctionnels en local. **Pas encore
> d'autofill réel ni d'intégration `@cloudity/pass-crypto`** : ces
> capacités sont planifiées en **MP-06** (post-migration Proton, J+1..J+5).

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
* un **content script** qui détecte les champs login et affiche un
  badge discret quand le coffre est déverrouillé ;
* un **popup** de déverrouillage / verrouillage maître (sans logique
  cryptographique réelle pour l'instant) ;
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
npm run build       # produit dist/
```

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
| Page web malveillante lit le DOM | content script ne touche pas au DOM avant déverrouillage explicite ; aucun champ rempli sans clic utilisateur (post MP-06). |
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
| **MP-06** (post-20 mai, J+1..J+5) | Intégrer `@cloudity/pass-crypto` (Argon2id + déchiffrement) ; appel `passwords-service` via gateway ; liste des entrées dans le popup ; autofill réel sur clic utilisateur ; domain matcher | ⏳ |
| **MP-07** | Tests Playwright extension (Chromium headless avec `--load-extension`) | ⏳ |
| **MP-08** | Portage **Firefox** (manifest MV3 cross-browser) puis **Safari** (wrapper Xcode) | ⏳ |

Suivi : [`BACKLOG.md`](../../BACKLOG.md) (entrée
*Sprint Pass — L2 extension*) et
[`docs/produit/MULTI-PLATEFORME.md`](../../docs/produit/MULTI-PLATEFORME.md)
(matrice multiplateforme).
