# Migrations PostgreSQL

Ce dossier contient les **migrations incrémentales** appliquées **automatiquement** au démarrage de la stack.

## Qu’est-ce que le service `db-migrate` ?

Dans `docker-compose.yml`, **`db-migrate`** n’est **pas** un serveur qui tourne en permanence : c’est un **conteneur one-shot** (image `postgres:15-alpine`) qui :

- attend que **Postgres** soit *healthy* ;
- exécute le script **`scripts/migrate-db.sh`** monté en lecture seule ;
- se termine avec succès (`condition: service_completed_successfully`) ;
- permet aux autres services (**auth-service**, **mail-directory-service**, etc.) de démarrer **après** que le schéma soit à jour.

En résumé : **db-migrate = job d’application des fichiers `.sql` de ce dossier**, avec suivi dans la table `schema_migrations`. Pas de port exposé, pas d’API.

## Application automatique

Lors de **`make up`**, le service **db-migrate** s’exécute après le healthcheck de Postgres. Il :

1. Crée la table `schema_migrations` si besoin.
2. Pour chaque fichier `.sql` dans ce dossier (ordre alphabétique), vérifie s’il est déjà appliqué.
3. Si non, exécute le script et enregistre la version.

Vous n’avez **rien à faire** : une base déjà existante recevra automatiquement les nouvelles migrations (ex. `04-schema-drive.sql`) au prochain `make up`.

## Fichiers

- `04-schema-drive.sql` — tables Drive (drive_nodes).
- `05-schema-calendar.sql` — table calendar_events.
- `06-schema-notes.sql` — table notes.
- `07-schema-tasks.sql` — tables task_lists, tasks.
- `20250225_mail_schema.sql` — schéma Mail (domaines, boîtes, alias).
- `16-mail-user-aliases.sql` — alias utilisateur par boîte connectée (`user_email_aliases`).
- `18-mail-alias-deliver-target.sql` — cible de livraison documentée par alias (`deliver_target_email`, Pass / transfert).

Pour ajouter une migration : créez un fichier `YYYYMMDD_nom.sql` ou `NN-schema-nom.sql` (ordre alphabétique = ordre d’application). Contenu de préférence **idempotent** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` puis `CREATE POLICY`, etc.).

## Application manuelle

Si vous voulez appliquer les migrations sans redémarrer la stack :

```bash
make migrate
```

(Exécute le conteneur db-migrate une fois.)
