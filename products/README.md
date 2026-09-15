# products/ — applications satellites dans Cloudity

Chaque produit a son **propre repo Git** (submodule). Déployable seul (Portainer), développable seul ou via `Cloudity.code-workspace`.

| Dossier | Statut | Produit | Repo |
|---------|--------|---------|------|
| `jobbing-track/` | **submodule actif** | JobbingTrack | `PavelDelhomme/JobbingTrack` (`dev`) |
| `fuel/` | **submodule actif** | GasoilTracking | `PavelDelhomme/GasoilTracking` (`dev`) |
| `music/` | **submodule actif** | PLM / YTMusic | `PavelDelhomme/YTMusic` (ou repo PLM) |
| `maps/` | **placeholder** | Cloudity Maps | à créer (voir `maps/README.md`) |

## Ouvrir

```bash
cursor Cloudity.code-workspace
```

Guide : [`docs/cursor/COMMENT-OUVRIR-CURSOR.md`](../docs/cursor/COMMENT-OUVRIR-CURSOR.md)

## Données

Les submodules **ne déplacent aucune donnée Docker**. Volumes VPS inchangés (`gasoil_api_data`, JT postgres, `ytmusic_ytmusic_data`, etc.).
