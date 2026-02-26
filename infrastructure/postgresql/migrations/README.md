# Migrations PostgreSQL

Ce dossier contient les **migrations incrémentales** appliquées **automatiquement** au démarrage de la stack.

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

Pour ajouter une migration : créez un fichier `YYYYMMDD_nom.sql` ou `NN-schema-nom.sql` (ordre alphabétique = ordre d’application). Contenu de préférence **idempotent** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` puis `CREATE POLICY`, etc.).

## Application manuelle

Si vous voulez appliquer les migrations sans redémarrer la stack :

```bash
make migrate
```

(Exécute le conteneur db-migrate une fois.)
