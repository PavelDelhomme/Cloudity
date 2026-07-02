# Stacks Portainer Cloudity

**Commencer par le guide maître** : [docs/operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](../../docs/operations/GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md) (local → LAN → prod NPM).

| Guide détaillé | [PORTAINER-STACK.md](./PORTAINER-STACK.md) |
|----------------|---------------------------------------------|
| Variables modèle | [stack.env.example](./stack.env.example) |
| Compose prod (`main`) | [docker-compose.stack.yml](./docker-compose.stack.yml) |
| Compose dev (`dev`) | [docker-compose.stack-dev.yml](./docker-compose.stack-dev.yml) |

**Résumé formulaire prod** :

- **Repository URL** : `https://github.com/PavelDelhomme/Cloudity.git`
- **Repository reference** : `refs/heads/main`
- **Compose path** : `deploy/portainer/docker-compose.stack.yml`
- **Secrets** : Portainer Environment variables (`make secrets-print` en local)

Suite : [DEPLOIEMENT-SUIVI.md](../../docs/operations/DEPLOIEMENT-SUIVI.md) · [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md).
