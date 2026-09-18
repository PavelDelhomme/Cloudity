# products/ — applications satellites dans Cloudity

Chaque produit a son **propre repo Git** (submodule). Déployable seul (Portainer).

| Dossier | Statut | Produit | Repo |
|---------|--------|---------|------|
| `jobbing-track/` | **submodule** (lecture) | JobbingTrack | `PavelDelhomme/JobbingTrack` (`dev`) |
| `GasoilTracking/` | **submodule** (lecture) | GasoilTracking | `PavelDelhomme/GasoilTracking` (`dev`) |
| `YTMusic/` | **submodule** (lecture) | PLM / YTMusic | `PavelDelhomme/YTMusic` (`dev`) |
| `maps/` | **submodule actif** | Cloudity Maps | `PavelDelhomme/CloudityMaps` (`main`) |

## Règle de développement (2026-09)

**GasoilTracking, YTMusic et JobbingTrack se développent en indépendant** (clones Perso / leurs branches).  
Dans le monorepo Cloudity : **ne pas modifier** `products/{GasoilTracking,YTMusic,jobbing-track}` ni bumper leurs SHA sauf demande explicite.

Travail Cloudity autorisé ici : `products/maps` (CloudityMaps), `backend/`, `platform/`, `scripts/ops/`, docs ecosystem, stacks Docker Cloudity.

## Ouvrir

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Alias (symlinks) : `products/fuel` → GasoilTracking, `products/music` → YTMusic.

## Maps

```bash
cd products/maps
python3 -m http.server 8765 --directory web
```

## Identité

SSO Cloudity ID (auth-service, flag préprod) : [`docs/ecosystem/CLOUDITY-AUTH-PLM.md`](../docs/ecosystem/CLOUDITY-AUTH-PLM.md)  
SDK : [`platform/identity-sdk/`](../platform/identity-sdk/)

## Données

Les submodules **ne déplacent aucune donnée Docker**. Volumes VPS inchangés.
