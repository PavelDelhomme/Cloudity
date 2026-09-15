# products/ — applications satellites dans Cloudity

Chaque produit a son **propre repo Git** (submodule). Déployable seul (Portainer), développable seul ou via `Cloudity.code-workspace`.

| Dossier | Statut | Produit | Repo |
|---------|--------|---------|------|
| `jobbing-track/` | **submodule actif** | JobbingTrack | `PavelDelhomme/JobbingTrack` (`dev`) |
| `fuel/` | placeholder | GasoilTracking | à brancher (voir `fuel/README.md`) |
| `music/` | placeholder | PLM / YTMusic | à brancher (voir `music/README.md`) |
| `maps/` | — | Cloudity Maps | plus tard |

## Ouvrir

```bash
# Suite (Cloudity + JT dans le même Cursor)
cursor Cloudity.code-workspace

# JT seul
cd products/jobbing-track && cursor .
```

Guide détaillé : [`docs/cursor/COMMENT-OUVRIR-CURSOR.md`](../docs/cursor/COMMENT-OUVRIR-CURSOR.md)

## Données

Les submodules **ne déplacent aucune donnée Docker**. Volumes VPS inchangés.
