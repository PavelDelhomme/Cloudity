# Cloudity Maps — vision & intégration suite

> 2026-09-15. Miroir de `products/GasoilTracking/docs/cloudity-maps-navigation.md`.

## Verdict

| Option | Décision |
|--------|----------|
| API Waze turn-by-turn dans une app Cloudity | **Non** (pas d’API publique) |
| Deep link Waze / Google / OsmAnd | **Oui** (optionnel) |
| Produit Maps type OsmAnd / Mappy (OSM) | **Oui** — `products/maps/` (placeholder) |
| Fusion serveur avec Gasoil | **Non** — stacks Portainer séparées |

## Intégration douce

1. Submodules : `jobbing-track`, `fuel` (Gasoil), futur `maps`.
2. Volumes Docker **immuables** côté migration (`gasoil_api_data` intact).
3. Gasoil continue son GPS/OSRM ; Maps = produit dédié plus tard.
4. Catalogues / APIs métier restent dans chaque produit (ex. `/api/vehicle-catalog` Gasoil).

Voir aussi : `docs/ecosystem/ARCHITECTURE-CURSOR-PORTAINER-SUITE.md`.
