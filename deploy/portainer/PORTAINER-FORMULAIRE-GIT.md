# Portainer — formulaire Git (copier-coller)

Guide long : **[`DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md)** · Architecture : **[`docs/architecture/STRUCTURE-CIBLE.md`](../../docs/architecture/STRUCTURE-CIBLE.md)**.

---

## Stack prod — `cloudity`

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `docker-compose.ghcr.yml` |
| **Additional paths** | *(vide)* |
| **Auth** | OFF si repo public |
| **Environment** | coller `deploy/portainer/stack.env` |
| **GitOps updates** | ON · intervalle `5m` |
| **Re-pull image and redeploy** | ON |
| **Prune** | OFF |

```bash
make portainer-prod-env NPM_NETWORK=shared-network-copy REGISTRY_OWNER=paveldelhomme
# → deploy/portainer/stack.env  (TAG=latest)
```

Vérifier : `REGISTRY_OWNER=paveldelhomme` · `NPM_NETWORK=shared-network-copy` · `TAG=latest`.

---

## Stack preprod — `cloudity-preprod` (recommandé)

Même formulaire, sauf :

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-preprod` |
| **Repository reference** | `refs/heads/preprod` |
| **Environment** | `stack.env` preprod (`TAG=preprod`, hôtes `*-preprod.…`) |

Fermer l’accès (IP allowlist / Basic auth NPM). Ne **pas** partager le volume Postgres **prod**.

---

## Anti-pièges

| | Bon | Mauvais |
|--|-----|---------|
| Compose path | `docker-compose.ghcr.yml` (racine) | `deploy/portainer/...` |
| Contrôle | Créer **dans** Portainer | `docker compose` SSH → **Limited** |
| `db-migrate` Exited(0) | OK (one-shot) | « service cassé » |
| Migration Limited→Total | `compose down` **sans** `-v` | `volume rm` (perd la DB) |

---

## NPM (après Deploy)

| Domaine | Forward | Port | Scheme |
|---------|---------|------|--------|
| `cloudity.…` | `cloudity-web` | 80 | **http** |
| `api.cloudity.…` | `cloudity-api-gateway` | 8000 | **http** |

---

## Màj

- **Toute la stack** : push branche → GitOps / Pull & redeploy / Watchtower  
- **Un service** : recreate du conteneur concerné (voir `DEPLOIEMENT_PROCEDURE.md` § 5.2)  
- **Mobile** : APK + manifeste OTA (hors Portainer)
