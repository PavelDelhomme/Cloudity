# Portainer / Cloudity

**Documentation unique :** [`DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md) (racine).

| Fichier ici | Rôle |
|-------------|------|
| `stack.env.example` | Modèle variables (sans secrets) |
| `stack.env` | Secrets locaux (gitignored) — `make portainer-prod-env` |
| `docker-compose.ghcr.yml` | Ancien chemin — utiliser **`/docker-compose.ghcr.yml` à la racine** |
| `NPM-PROXY-HOSTS.md` | Rappel hosts NPM |
| `../watchtower-compose.yml` | Watchtower (màj images) |

```bash
make portainer-prod-env NPM_NETWORK=shared-network-copy
```
