**Stacks Portainer Cloudity**

### Commencer ici

1. **Guide complet formulaire Git** (auth, Compose path, Additional paths, NPM, dépannage) :  
   **[docs/operations/PORTAINER-STACK-GIT-COMPLET.md](../../docs/operations/PORTAINER-STACK-GIT-COMPLET.md)**
2. **Versions libs / services / images** :  
   **[docs/operations/VERSIONS-PROJET.md](../../docs/operations/VERSIONS-PROJET.md)**
3. Résumé formulaire : [PORTAINER-STACK.md](./PORTAINER-STACK.md)

| Fichier | Rôle |
|---------|------|
| [PORTAINER-STACK.md](./PORTAINER-STACK.md) | Formulaire condensé + NPM |
| [docker-compose.stack.yml](./docker-compose.stack.yml) | Entrée **prod** Git build (`refs/heads/main`) |
| [docker-compose.stack-dev.yml](./docker-compose.stack-dev.yml) | Entrée **dev** Git build |
| **[docker-compose.ghcr.yml](./docker-compose.ghcr.yml)** | **Prod GHCR** — recommandé (style YTMusic + Watchtower) |
| [portainer-template.yml](./portainer-template.yml) | Raccourci doc Portainer CE |
| [stack.env.example](./stack.env.example) | Modèle variables (sans secrets) |

**Watchtower** (MAJ auto sans webhook Pro) : [../watchtower-compose.yml](../watchtower-compose.yml)

**Guide première install VPS** : **[PORTAINER-INSTALL-PROD.md](./PORTAINER-INSTALL-PROD.md)** ← commence ici

**Générer le bloc env Portainer (secrets prod frais)** :

```bash
make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
# ou DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh
```

**Générer les env Portainer depuis ton PC** :

```bash
make env-prod DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh FORCE=1
make portainer-env
# Coller dans Portainer + NPM_NETWORK=<réseau NPM>
make h14-https-check
```

Suite : [DEPLOIEMENT-SUIVI.md](../../docs/operations/DEPLOIEMENT-SUIVI.md) · [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md) · [GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](../../docs/operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md).
