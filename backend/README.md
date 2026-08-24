# Backend Cloudity

## Aujourd’hui

Services **à plat** sous `backend/<name>/` (+ `pkg/`, `internalsec/`).

## Catégories

| Type | Services | Clients |
|------|----------|---------|
| **Plateforme** | `api-gateway`, `auth-service`, `admin-service`, `mail-directory-service`, `internalsec` | Toute la suite |
| **Produit** | `calendar`, `contacts`, `drive`, `notes`, `passwords`, `photos`, `tasks` | Web + mobile dédiés |

Cible dossiers : [`docs/architecture/STRUCTURE-CIBLE.md`](../docs/architecture/STRUCTURE-CIBLE.md) § 2.

**Règle** : aucun client public ne parle à un service produit sans passer par `api-gateway`.
