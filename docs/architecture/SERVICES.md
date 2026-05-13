# Services Cloudity — référence des conteneurs

> **Source de vérité** : ce fichier liste **chaque conteneur Docker** déclaré
> dans `docker-compose.yml`, son **rôle**, son **port host**, et s'il tourne
> en **prod** ou seulement en **dev**. Si tu vois un nom dans le tableau de
> `make status` ou dans `docker ps` que tu ne reconnais pas, c'est ici qu'il
> faut chercher.
>
> **À synchroniser** quand on ajoute / retire un service du Compose.

---

## 1. Vue d'ensemble (préfixe `cloudity-`)

Tous les conteneurs portent le **préfixe `cloudity-`** pour ne pas se mélanger
avec d'autres stacks Docker éventuelles sur la même machine. Cinq familles :

| Famille | Containers | Rôle |
|---------|------------|------|
| **Données** | `cloudity-postgres`, `cloudity-redis` | Persistance + cache / sessions. |
| **Migrations** | `cloudity-db-migrate` | Job *one-shot* qui applique les SQL au démarrage. |
| **Backend** | `cloudity-auth-service`, `cloudity-api-gateway`, `cloudity-admin-service`, `cloudity-passwords-service`, `cloudity-mail-directory-service`, `cloudity-calendar-service`, `cloudity-notes-service`, `cloudity-tasks-service`, `cloudity-drive-service`, `cloudity-photos-service`, `cloudity-contacts-service` | Microservices métier. |
| **Frontend** | `cloudity-web` | App React (toutes les UIs Drive / Pass / Mail / `/4dm1n`). |
| **Outils dev (profil `dev`)** | `cloudity-adminer`, `cloudity-redis-commander` | UI web pour inspecter Postgres / Redis **en local**. **NE TOURNENT PAS EN PROD.** |

---

## 2. Tableau détaillé

| Container | Image | Port host | Profil | Rôle |
|-----------|-------|-----------|--------|------|
| `cloudity-postgres` | `postgres:15-alpine` | **6042** → 5432 | toujours | Base relationnelle. |
| `cloudity-redis` | `redis:7-alpine` | **6079** → 6379 | toujours | Sessions, refresh tokens, challenges WebAuthn. |
| `cloudity-db-migrate` | build local | — (job) | toujours | Applique `infrastructure/postgresql/migrations/*.sql` puis sort code 0. « Exited (0) » = OK. |
| `cloudity-auth-service` | build local (Go) | **6081** → 8081 | toujours | `/auth/*` (login, register, 2FA, recovery codes, passkeys, capability URLs). |
| `cloudity-api-gateway` | build local (Go) | **6080** → 8000 | toujours | **Point d'entrée API unique** côté front. CORS + JWT + proxy vers les services métier. |
| `cloudity-admin-service` | build local (Python FastAPI) | **6082** → 8082 | toujours | `/admin/*` : tenants, users, stats. Réservé à `/4dm1n`. |
| `cloudity-passwords-service` | build local (Go) | **6051** → 8051 | toujours | `/pass/*` : vaults, items chiffrés (E2EE — backend ne voit que du ciphertext). |
| `cloudity-mail-directory-service` | build local (Go) | **6050** → 8050 | toujours | `/mail/*` : domaines, comptes, alias, IMAP, messages. |
| `cloudity-calendar-service` | build local (Go) | **6052** → 8052 | toujours | `/calendar/*` : événements. |
| `cloudity-notes-service` | build local (Go) | **6053** → 8053 | toujours | `/notes/*` : notes. |
| `cloudity-tasks-service` | build local (Go) | **6054** → 8054 | toujours | `/tasks/*` : listes + tâches. |
| `cloudity-drive-service` | build local (Go) | **6055** → 8055 | toujours | `/drive/*` : fichiers, dossiers, corbeille, récents. |
| `cloudity-photos-service` | build local (Go) | **6056** → 8056 | toujours | `/photos/*` : timeline. |
| `cloudity-contacts-service` | build local (Go) | **6057** → 8057 | toujours | `/contacts/*`. |
| `cloudity-web` | build local (Vite/React) | **6001** → 3000 | toujours | App web : `/`, `/login`, `/app/*`, `/4dm1n`. |
| `cloudity-adminer` | `adminer:4-standalone` | **6083** → 8080 | **dev** uniquement | UI Web Postgres : `http://localhost:6083`. |
| `cloudity-redis-commander` | `ghcr.io/joeferner/redis-commander:latest` | **6084** → 8081 | **dev** uniquement | UI Web Redis : `http://localhost:6084` (HTTP basic `admin/admin`). |

---

## 3. Outils dev — pourquoi Adminer et Redis Commander ?

Ces deux conteneurs **ne servent QU'au développement local**. Ils sont
derrière le profil Docker Compose **`dev`** (cf. `profiles: [dev]` dans
`docker-compose.yml`) — autrement dit, **`docker compose up`** seul ne les
démarre pas, il faut **`docker compose --profile dev up`** ou `make up`
(qui inclut le profil dev par défaut).

### 3.1 `cloudity-adminer` (port **6083**)

* **Adminer** est un client web mono-fichier pour PostgreSQL / MySQL /
  SQLite. Équivalent **léger** de pgAdmin / phpMyAdmin.
* Usage : ouvrir <http://localhost:6083>, choisir « PostgreSQL », serveur
  `postgres`, base `cloudity`, user `cloudity_user`, mot de passe = celui
  de `POSTGRES_PASSWORD` dans ton `.env`.
* Quand l'utiliser : explorer le schéma DB, voir le contenu des tables
  (`users`, `pass_vaults`, …), exécuter des `SELECT` ad-hoc, vérifier
  qu'une migration s'est bien appliquée.
* **À ne JAMAIS exposer en prod** : pas de 2FA, pas de rate-limit, accès
  direct au superuser DB.

### 3.2 `cloudity-redis-commander` (port **6084**)

* **Redis Commander** est une UI web pour Redis (équivalent visuel à
  `redis-cli`).
* Usage : ouvrir <http://localhost:6084> (basic auth dev `admin/admin`,
  cf. `HTTP_USER` / `HTTP_PASSWORD` dans `docker-compose.yml`). Le seul
  Redis branché est le local (`local:redis:6379:0`).
* Quand l'utiliser :
  * inspecter les **refresh tokens** chiffrés (`session:refresh:<hash>`),
  * regarder les **challenges WebAuthn** (`webauthn:session:<sub>:<id>`,
    TTL 5 min),
  * vérifier que le **rate-limit login** se vide bien
    (`auth:login:ratelimit:*`),
  * dumper / flusher une clé pour reproduire un bug.
* **À ne JAMAIS exposer en prod** : `admin/admin` est volontairement
  trivial pour le dev local. En prod, tout l'accès Redis passe par les
  services internes via le réseau `cloudity-network`, qui n'est pas
  routable depuis l'extérieur (et qui sera en mTLS strict sous peu, cf.
  [`MTLS-INTERNE.md`](../securite/MTLS-INTERNE.md)).

### 3.3 Comment retirer ces conteneurs

```bash
# ne PAS démarrer adminer + redis-commander
docker compose up -d  # SANS --profile dev

# arrêter uniquement les outils dev
docker compose --profile dev stop adminer redis-commander
```

En production, le `docker-compose.prod.yml` ne référence **pas** ces deux
images : `make prod-build` / `make prod-up` les ignorent automatiquement.

---

## 4. Le tableau de `make status`

`scripts/dev/status.sh` (alias `make status`, `make stat`, `make stats`) lit
la sortie de `docker compose ps` et affiche un **tableau aligné** avec, pour
chaque conteneur, son nom court (sans préfixe `cloudity-`), le port host,
l'URL et l'état (`Up` / `Down` / `OK (job)` pour `db-migrate`).

```
  ----------------------------------------------------------------
    Cloudity — État des services  2026-05-13 16:50:00
  ----------------------------------------------------------------

  SERVICE                       PORT   URL                                ÉTAT
  ----------------------------------------------------------------
  postgres                      6042   localhost:6042                     Up
  redis                         6079   localhost:6079                     Up
  db-migrate                    n/a    —                                  OK (job)
  auth-service                  6081   http://localhost:6081              Up
  api-gateway                   6080   http://localhost:6080              Up
  admin-service                 6082   http://localhost:6082              Up
  ...
  cloudity-web                  6001   http://localhost:6001              Up
  adminer                       6083   http://localhost:6083              Up
  redis-commander               6084   http://localhost:6084              Up
```

`db-migrate` apparaît comme **`OK (job)`** parce que c'est un *one-shot*
dont l'arrêt « Exited (0) » signifie « migrations passées avec succès ».

---

## 5. Références croisées

* Plan DNS prod (sous-domaines `api.` / `app.` / `auth.`) :
  [`STATUS.md` § 2.4](../../STATUS.md).
* Mise à jour des ports : `docker-compose.yml` (root) et le tableau
  ci-dessus restent **synchronisés** ; toute modification dans l'un doit
  être reflétée dans l'autre.
* Ajouter un nouveau service : voir
  [`EVOLUTION-PLATEFORME.md`](EVOLUTION-PLATEFORME.md) (« étapes pour
  ajouter un microservice »).

---

*Index mis à jour : 2026-05-13 — création du fichier (clarification
`redis-commander` / `adminer`).*
