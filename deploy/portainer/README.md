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
| [docker-compose.stack.yml](./docker-compose.stack.yml) | Entrée **prod** (`refs/heads/main`) |
| [docker-compose.stack-dev.yml](./docker-compose.stack-dev.yml) | Entrée **dev** (`refs/heads/dev`) |
| [stack.env.example](./stack.env.example) | Modèle variables (sans secrets) |

**Générer les env Portainer depuis ton PC** :

```bash
make env-prod DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh FORCE=1
make portainer-env
# Coller dans Portainer + NPM_NETWORK=<réseau NPM>
make h14-https-check
```

Suite : [DEPLOIEMENT-SUIVI.md](../../docs/operations/DEPLOIEMENT-SUIVI.md) · [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md) · [GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](../../docs/operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md).
