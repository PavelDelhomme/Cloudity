# products/ — applications satellites dans Cloudity

Chaque sous-dossier est un **produit** avec son propre Git (submodule), déployable seul via Portainer, développable seul ou via le workspace Cloudity.

| Dossier | Produit | Repo |
|---------|---------|------|
| `jobbing-track/` | JobbingTrack (emploi) | `PavelDelhomme/JobbingTrack` |
| `fuel/` *(à venir)* | GasoilTracking | `PavelDelhomme/GasoilTracking` |
| `music/` *(à venir)* | PLM / YTMusic | `PavelDelhomme/YTMusic` |
| `maps/` *(à venir)* | Cloudity Maps | nouveau |

## Commandes

```bash
# Initialiser / mettre à jour les submodules
git submodule update --init --recursive

# Ouvrir JobbingTrack seul
cd products/jobbing-track && cursor .

# Ouvrir toute la suite
cursor Cloudity.code-workspace
```

**Volumes Docker prod** restent sur le VPS, **noms inchangés** — le submodule ne déplace **aucune** donnée utilisateur.
