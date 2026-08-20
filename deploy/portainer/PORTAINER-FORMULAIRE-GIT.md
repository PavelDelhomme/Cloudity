# Portainer — formulaire Git (copier-coller)

Stack **`cloudity`** · branche **`prod`**.

---

## Stacks → Add stack

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `docker-compose.ghcr.yml` |
| **Additional paths** | *(laisser vide)* |
| **Repository authentication** | OFF si repo **public** |
| **Environment variables** | coller `deploy/portainer/stack.env` |
| **GitOps updates** | ON (recommandé) |
| **Re-pull image and redeploy** | ON |
| **Prune unused containers** | OFF |

### Pièges déjà vus

| Champ / détail | Bon | Mauvais |
|----------------|-----|---------|
| Compose path | `docker-compose.ghcr.yml` (racine) | `deploy/portainer/...` |
| `db-migrate` | image `cloudity-db-migrate` (GHCR) | bind mount `./scripts` → **vides** sur l’hôte Portainer |
| `REGISTRY_OWNER` | `paveldelhomme` | `PavelDelhomme` |
| `NPM_NETWORK` | `shared-network-copy` (comme Nextcloud) | mauvais nom → web/API injoignables depuis NPM |
| Volume Postgres | **supprimé** avant recreer | volume ancien sans `init/` |

---

## Fichier Environment (PC)

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity
make portainer-prod-env NPM_NETWORK=shared-network-copy
```

Fichier : `deploy/portainer/stack.env` (gitignored).

Dans Portainer → Environment → coller le contenu. Vérifier surtout :

```
REGISTRY_OWNER=paveldelhomme
NPM_NETWORK=shared-network-copy
TAG=latest
```

---

## Avant Deploy (VPS — nettoyage)

```bash
docker rm -f $(docker ps -aq --filter name=cloudity) 2>/dev/null || true
docker volume rm cloudity_postgres_data cloudity_redis_data cloudity_auth_keys cloudity_mobile_data 2>/dev/null || true
docker network rm cloudity-data 2>/dev/null || true
```

---

## Après Deploy — succès si

1. `cloudity-db-migrate` → **Exited (0)** + log `[migrate] Terminé.`
2. `cloudity-api-gateway` → **healthy**
3. `cloudity-web` → **running** sur réseau `shared-network-copy`

Puis NPM :

| Domaine | Forward | Port |
|---------|---------|------|
| `cloudity.delhomme.ovh` (+ apps) | `cloudity-web` | `80` |
| `api.cloudity.delhomme.ovh` | `cloudity-api-gateway` | `8000` |

---

## Mise à jour Portainer (optionnel, après Cloudity OK)

Sur le VPS :

```bash
# récupérer le script depuis le repo cloné ou scp
chmod +x scripts/ops/upgrade-portainer.sh
./scripts/ops/upgrade-portainer.sh          # → 2.39.6 + backup
# Rollback documenté en fin de script
```
