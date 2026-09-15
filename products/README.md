# products/ — applications satellites dans Cloudity

Chaque produit a son **propre repo Git** (submodule). Déployable seul (Portainer), développable seul ou via `Cloudity.code-workspace`.

| Dossier | Statut | Produit | Repo |
|---------|--------|---------|------|
| `jobbing-track/` | **submodule actif** | JobbingTrack | `PavelDelhomme/JobbingTrack` (`dev`) |
| `GasoilTracking/` | **submodule actif** | GasoilTracking | `PavelDelhomme/GasoilTracking` (`dev`) |
| `YTMusic/` | **submodule actif** | PLM / YTMusic | `PavelDelhomme/YTMusic` (`dev`) |
| `maps/` | **placeholder** | Cloudity Maps | à créer (voir `maps/README.md`) |

## Ouvrir

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Chemins canoniques :

- `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/GasoilTracking`
- `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/YTMusic`
- `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/jobbing-track`

(Les clones historiques sous `/Perso/GasoilTracking`, `/Perso/YTMusic`, etc. = **même repo Git**.)

Guide : [`docs/cursor/COMMENT-OUVRIR-CURSOR.md`](../docs/cursor/COMMENT-OUVRIR-CURSOR.md)

## Identité

SSO Cloudity ID ↔ PLM : [`docs/ecosystem/CLOUDITY-AUTH-PLM.md`](../docs/ecosystem/CLOUDITY-AUTH-PLM.md)  
SDK squelette : [`platform/identity-sdk/`](../platform/identity-sdk/)

## Données

Les submodules **ne déplacent aucune donnée Docker**. Volumes VPS inchangés (`gasoil_api_data`, JT postgres, `ytmusic_ytmusic_data`, etc.).
