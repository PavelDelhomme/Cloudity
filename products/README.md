# products/ — archive Cloudity

**Ce monorepo n’est plus le holding.** Hubera (`~/Documents/Dev/Perso/Hubera`, domaine `hubera.cloud`) porte le catalogue, la vitrine et les apps.

Les submodules satellites ont été **retirés** (JobbingTrack, GasoilTracking, YTMusic, Maps). Les clones Perso et leurs stacks Portainer / volumes Docker **n’ont pas bougé**.

| Ancien dossier | Où développer maintenant |
|----------------|--------------------------|
| `jobbing-track/` | `~/Documents/Dev/Perso/JobbingTrack` · Hubera `products/jobs` |
| `GasoilTracking/` / `fuel/` | `~/Documents/Dev/Perso/GasoilTracking` · Hubera `products/fuel` |
| `YTMusic/` / `music/` | `~/Documents/Dev/Perso/YTMusic` · Hubera `products/music` |
| `maps/` | `~/Documents/Dev/Perso/Maps` · Hubera `products/maps` |

Mail, Drive, Pass, ID, Calendar, Contacts, Notes, Photos, Office : extraction vers des repos **Hubera\*** (Git séparés). Le code ici reste une **archive / source** jusqu’à cutover greenfield.

Workspace réduit : `Cloudity.code-workspace` n’ouvre plus que ce repo (archive).

Ne pas : bumper d’anciens submodules, `docker compose down -v`, fusionner ce Git avec Hubera.
