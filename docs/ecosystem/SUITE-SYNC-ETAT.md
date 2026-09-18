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
2. SSO auth-service : env `CLOUDITY_SSO_ENABLED` (compose + `.env.example`) ; smoke `scripts/ops/sso-preprod-smoke.sh`.
3. **restic → S3** : `scripts/ops/restic-suite-s3.sh` (init/run/snapshots/check).
4. Device : `scripts/dev/adb-blackview-only.sh` (BV9700Pro uniquement).

## Encore ouvert

1. Brancher credentials S3 VPS + premier `restic --init/--run`.
2. Activer `CLOUDITY_SSO_ENABLED=1` sur **préprod** Cloudity seulement (migration 50 déjà dans le repo).
3. Maps : Android / offline (dans repo CloudityMaps).
4. Merger `chore/restructure-platform` quand validé.

## Ne pas faire

- Commit / push / bump dans Gasoil, YTMusic, JobbingTrack depuis cette session Cloudity.
- Fusionner stacks Portainer / volumes.
- Activer SSO en **prod** sans validation préprod.
