Dossier optionnel à la racine du dépôt : les données de la stack dev passent surtout par des
**volumes Docker nommés** (ex. cloudity-postgres-data), pas par ./storage/.

- backups/   — réservé à des sauvegardes manuelles ou à un futur job (non câblé par défaut).
- logs/      — pour exports de logs hôte/CI si vous les configurez ; les conteneurs loguent vers stdout.
- postgres/  — non utilisé par docker-compose actuel (la DB est dans le volume Docker postgres_data).
- redis/     — idem pour Redis (volume dédié ou données éphémères selon votre compose).

Pour la configuration : infrastructure/postgresql/, infrastructure/redis/, infrastructure/nginx/.
