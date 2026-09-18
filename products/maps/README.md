# Cloudity Maps (placeholder)

Produit **cartes / navigation** de la suite Cloudity — **pas encore un repo Git**.

Chemin : `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/maps`

## Intention

- Expérience type **OsmAnd / Organic Maps / Mappy** (OSM, offline possible, F-Droid-friendly).
- **Pas** de moteur Waze embarqué (pas d’API nav publique) — deep link Waze optionnel uniquement.
- Stacks / volumes **séparés** de Gasoil (`products/GasoilTracking`) et JobbingTrack.

## Lien GasoilTracking

Gasoil garde conso + GPS (Leaflet/OSM/OSRM). Plus tard :

- Intent / scheme `cloudity-maps://navigate?...`
- Fallback « Ouvrir dans… » (Google / Waze / OsmAnd) depuis Gasoil

Réf. : `../GasoilTracking/docs/cloudity-maps-navigation.md`

## Prochaines étapes (ordre)

1. **Dans Gasoil** (rapide) : boutons « Ouvrir dans Waze / OsmAnd / Organic Maps » (`lib/mapsNavigation.ts`).
2. Créer le repo GitHub `PavelDelhomme/CloudityMaps` (vide / README).
3. Remplacer ce placeholder par un **submodule** (comme `jobbing-track` / `GasoilTracking`).
4. MVP : carte OSM + itinéraire OSRM/Valhalla (web puis Android).
5. Brancher Gasoil → Maps via deep link / export trajets (sans fusionner les DB).
