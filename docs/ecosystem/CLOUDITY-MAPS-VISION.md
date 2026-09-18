# Cloudity Maps — vision & intégration suite

> MAJ 2026-09-18. Repo : [`PavelDelhomme/CloudityMaps`](https://github.com/PavelDelhomme/CloudityMaps) → submodule `products/maps`.

## Verdict

| Option | Décision |
|--------|----------|
| API Waze turn-by-turn dans une app Cloudity | **Non** (pas d’API publique) |
| Deep link Waze / Google / OsmAnd | **Oui** (optionnel, côté apps satellites) |
| Produit Maps type OsmAnd / Mappy (OSM) | **Oui** — submodule `products/maps` |
| Fusion serveur avec Gasoil | **Non** — stacks Portainer séparées |

## État

- MVP web : `products/maps/web/` (Leaflet + OSRM public démo).
- Deep links documentés : `products/maps/docs/deep-links.md` (`cloudity-maps://…`).
- Gasoil / YTMusic / JT : **développés hors monorepo** pour l’instant — ne pas y committer depuis Cloudity.

## Intégration douce

1. Submodules : `jobbing-track`, `GasoilTracking`, `YTMusic`, **`maps`**.
2. Volumes Docker **immuables** côté migration.
3. Brancher plus tard les satellites via deep link (dans *leur* repo), sans fusion DB.

Voir aussi : `docs/ecosystem/ARCHITECTURE-CURSOR-PORTAINER-SUITE.md`.
