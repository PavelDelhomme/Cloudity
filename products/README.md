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

Alias (symlinks, mêmes dossiers) : `products/fuel` → GasoilTracking, `products/music` → YTMusic.

**Un seul lieu de vérité pour développer** = ces chemins sous Cloudity. Les clones `/Perso/JobbingTrack`, `/Perso/GasoilTracking`, `/Perso/YTMusic` sont optionnels (même remote) : après un `git pull` sur `dev`, ou arrête-les et n’ouvre plus que le submodule.

## Cursor : tout fermer puis rouvrir

```bash
# 1. Fermer toutes les fenêtres Cursor
# 2. Relancer la suite
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Tu auras 4 racines : Cloudity · JobbingTrack · GasoilTracking · YTMusic.  
Pour un seul produit : `cd products/YTMusic && cursor .` (idem GasoilTracking / jobbing-track).

Guide : [`docs/cursor/COMMENT-OUVRIR-CURSOR.md`](../docs/cursor/COMMENT-OUVRIR-CURSOR.md)

## Identité

SSO Cloudity ID ↔ PLM : [`docs/ecosystem/CLOUDITY-AUTH-PLM.md`](../docs/ecosystem/CLOUDITY-AUTH-PLM.md)  
SDK squelette : [`platform/identity-sdk/`](../platform/identity-sdk/)

## Données

Les submodules **ne déplacent aucune donnée Docker**. Volumes VPS inchangés (`gasoil_api_data`, JT postgres, `ytmusic_ytmusic_data`, etc.).
