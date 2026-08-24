# Stacks Portainer Cloudity

**Documentation unique :** **[DEPLOIEMENT_PROCEDURE.md](../../DEPLOIEMENT_PROCEDURE.md)** (racine du dépôt).

| Fichier ici | Rôle |
|-------------|------|
| `stack.env.example` | Modèle variables (sans secrets) |
| `stack.env` | Secrets locaux (gitignored) — générer via `make portainer-prod-env` |
| `docker-compose.ghcr.yml` | **Ancien chemin** — le compose prod à utiliser est **`/docker-compose.ghcr.yml` à la racine** |
| `watchtower` | Voir `../watchtower-compose.yml` |

```bash
make portainer-prod-env NPM_NETWORK=shared-network-copy
# Coller deploy/portainer/stack.env dans Portainer → Environment
```
