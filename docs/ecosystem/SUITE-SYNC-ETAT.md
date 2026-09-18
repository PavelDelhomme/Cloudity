# Suite Cloudity — état sync & prochaines actions

> MAJ 2026-09-18. Chemins sous `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/`.

## Sync Git / GitHub

| Produit | Dossier | Branche submodule | Notes |
|---------|---------|-------------------|--------|
| JobbingTrack | `jobbing-track/` | `dev` | OK |
| GasoilTracking | `GasoilTracking/` (+ alias `fuel` →) | `dev` | deep links Waze/OsmAnd/Organic + catalogue API live |
| YTMusic / PLM | `YTMusic/` (+ alias `music` →) | `dev` | `cloudityLink.ts` opt-in (flag off) ; WIP stream non commité |
| Cloudity Maps | `maps/` | **placeholder** (pas de repo) | — |
| Parent Cloudity | — | `chore/restructure-platform` | SSO identity_link + ops backup |

## Fait récemment

1. **Gasoil** — préférence nav multi-apps (Compte) + FAB « Ouvrir dans… » (Waze / OsmAnd / Organic Maps, deep link).
2. **Gasoil** — catalogue véhicules B/C live en prod (ETag + cache 7j).
3. **Cloudity auth** — `POST/GET /auth/identity/link(s)` derrière `CLOUDITY_SSO_ENABLED` (défaut 404).
4. **YTMusic** — helper `api/src/auth/cloudityLink.ts` (no-op si flag off).
5. **Ops VPS** — `cloudity-bridge` créé ; backups → `$HOME/backups/cloudity-suite` (postgres + mobile + gasoil).

## Encore ouvert (priorisé)

1. **Maps** — créer `PavelDelhomme/CloudityMaps` + submodule (quand on démarre vraiment le produit).
2. **SSO** — activer `CLOUDITY_SSO_ENABLED` en préprod seulement ; brancher le helper PLM au login.
3. **Ops** — restic → S3 chiffré ; archive `ytmusic_ytmusic_data` (~22G) hors heures.
4. **Gasoil** — phase **D** catalogue (import ADEME / data.gouv) si besoin de couverture auto.
5. **Cloudity** — merger `chore/restructure-platform` → `dev`/`main` quand validé.

## Ne pas faire

- Fusionner les stacks Portainer / volumes (`gasoil_api_data`, etc.).
- Embarquer un moteur Waze / cloner Google Maps.
- Copier l’API Gasoil dans le gateway Go Cloudity.
- `docker volume prune` / Remove des volumes critiques.
