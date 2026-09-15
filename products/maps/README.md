# Cloudity Maps (placeholder)

Produit **cartes / navigation** de la suite Cloudity — **pas encore un repo Git**.

## Intention

- Expérience type **OsmAnd / Organic Maps / Mappy** (OSM, offline possible, F-Droid-friendly).
- **Pas** de moteur Waze embarqué (pas d’API nav publique) — deep link Waze optionnel uniquement.
- Stacks / volumes **séparés** de Gasoil (`products/GasoilTracking`) et JobbingTrack.

## Lien GasoilTracking

Gasoil garde conso + GPS (Leaflet/OSM/OSRM). Plus tard :

- Intent / scheme `cloudity-maps://navigate?...`
- Fallback « Ouvrir dans… » (Google / Waze / OsmAnd) depuis Gasoil

Référence : `products/GasoilTracking/docs/cloudity-maps-navigation.md` (repo GasoilTracking).

## Prochaine étape

Créer le repo `PavelDelhomme/CloudityMaps` (ou équivalent) et le brancher ici en submodule, comme `GasoilTracking/` et `jobbing-track/`.
