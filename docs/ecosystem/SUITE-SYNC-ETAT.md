# Suite Cloudity — état sync & prochaines actions

> MAJ 2026-09-18. **Règle** : ne pas modifier `products/{GasoilTracking,YTMusic,jobbing-track}` depuis Cloudity (dev indépendant Perso).

## Sync

| Produit | Dossier | Notes |
|---------|---------|--------|
| JobbingTrack | `jobbing-track/` | lecture seule côté Cloudity ; Perso = même SHA |
| GasoilTracking | `GasoilTracking/` | Perso souvent sur `prod` / autre SHA — **ne pas bumper** |
| YTMusic / PLM | `YTMusic/` | Perso sur branches stream — **ne pas bumper** |
| **Cloudity Maps** | `maps/` | submodule `PavelDelhomme/CloudityMaps` (`main`) |
| Parent Cloudity | — | `chore/restructure-platform` |

## Fait (Cloudity-only)

1. Repo + submodule **CloudityMaps** (MVP Leaflet/OSRM).
2. **SSO** : `CLOUDITY_SSO_ENABLED=1` local + `.env.preprod` ; smoke → HTTP 401 (route vivante). Prod VPS **non** activé.
3. **restic** VPS : repo chiffré local `~/backups/restic-cloudity` + snapshot 4.7 GiB. S3 en attente de credentials (`restic-s3.env`).
4. Device : `scripts/dev/adb-blackview-only.sh` (BV9700Pro).

## Encore ouvert

1. Remplir `~/.config/cloudity/restic-s3.env` (bucket + AWS keys) puis `restic copy` / repo S3.
2. Stack Portainer **préprod** dédiée Cloudity (aujourd’hui une seule stack `cloudity` GHCR prod-like) — coller `.env.preprod` (SSO=1) quand elle existe.
3. Maps Android / offline (repo CloudityMaps).
4. Merger `chore/restructure-platform` quand validé.

## Ne pas faire

- Commit / push / bump dans Gasoil, YTMusic, JobbingTrack depuis cette session Cloudity.
- Fusionner stacks Portainer / volumes.
- Activer SSO en **prod** sans validation préprod.
