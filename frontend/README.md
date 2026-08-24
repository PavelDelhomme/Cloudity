# Frontend Cloudity

## Apps (`apps/`)

| App | Rôle |
|-----|------|
| **`cloudity-web`** | Shell : login, hub `/app`, **et encore** Drive/Pass/Photos/Office/admin embedded |
| **`web-mail`** | Mail extrait (build séparé) — modèle pour les prochaines apps |

## Packages (`packages/`)

| Package | Rôle |
|---------|------|
| `@cloudity/ui` | Design system |
| `@cloudity/shared` | API / auth / types |
| `@cloudity/pass-crypto`, `app-vault-crypto` | Crypto |

Cible découpage : [`docs/architecture/STRUCTURE-CIBLE.md`](../docs/architecture/STRUCTURE-CIBLE.md) · [`MULTI-APPS-WEB-MOBILE.md`](../docs/architecture/MULTI-APPS-WEB-MOBILE.md).
