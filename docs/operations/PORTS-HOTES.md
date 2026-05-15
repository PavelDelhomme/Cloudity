# Ports hôte (dev Docker) — une source de vérité

**Objectif** : comprendre **quel service** écoute **où** sur la machine hôte, et comment **changer** les ports sans éditer partout le `docker-compose.yml` (variables dans **`.env`** à la racine du dépôt — Docker Compose les charge automatiquement).

**Référence conteneurs** : [../architecture/SERVICES.md](../architecture/SERVICES.md).

**Récap à l’écran** : depuis la racine du dépôt, **`make status`** affiche l’état des conteneurs **et** un bloc d’URLs (hub, Pass, Mail, gateway, Adminer…) en respectant les **`PORT_*`** du `.env`. Pour un **autre appareil sur le LAN** : `export CLOUDITY_STATUS_HOST='<IP_de_la_machine_dev>'` puis **`make status`** (HTTP par défaut ; `CLOUDITY_STATUS_PROTO=https` si tu termines le TLS en local). Script : **`scripts/dev/status.sh`**.

---

## 1. Variables (défauts = comportement historique 60XX)

| Variable | Défaut | Service | Port **interne** conteneur |
|----------|--------|---------|----------------------------|
| `PORT_POSTGRES` | 6042 | postgres | 5432 |
| `PORT_REDIS` | 6079 | redis | 6379 |
| `PORT_AUTH` | 6081 | auth-service | 8081 |
| `PORT_GATEWAY` | 6080 | api-gateway | 8000 |
| `PORT_ADMIN` | 6082 | admin-service | 8082 |
| `PORT_MAIL_DIRECTORY` | 6050 | mail-directory-service | 8050 |
| `PORT_PASSWORDS` | 6051 | passwords-service | 8051 |
| `PORT_CALENDAR` | 6052 | calendar-service | 8052 |
| `PORT_NOTES` | 6053 | notes-service | 8053 |
| `PORT_TASKS` | 6054 | tasks-service | 8054 |
| `PORT_DRIVE` | 6055 | drive-service | 8055 |
| `PORT_CONTACTS` | 6056 | contacts-service | 8056 |
| `PORT_PHOTOS` | 6057 | photos-service | 8057 |
| `PORT_DASHBOARD` | 6001 | cloudity-web | 3000 |
| `PORT_ADMINER` | 6083 | adminer (profil **dev**) | 8080 |
| `PORT_REDIS_COMMANDER` | 6084 | redis-commander (profil **dev**) | 8081 |

Exemple dans `.env` :

```bash
PORT_DASHBOARD=6002
PORT_GATEWAY=6003
```

Puis `make restart` (ou `make down && make up`). **Aligner** aussi `VITE_API_URL` / URLs OAuth si elles pointent encore vers l’ancien port du gateway.

---

## 2. Makefile vs `.env`

- **`docker compose`** lit `.env` pour les variables du tableau ci-dessus.
- Le **Makefile** définit les **mêmes** valeurs par défaut (`PORT_* ?= …`) pour `make health`, `make seed-admin`, etc. Si tu changes uniquement `.env`, vérifie que les cibles Make utilisées voient les mêmes ports (export manuel ou ajustement des variables en ligne : `make health PORT_GATEWAY=6003`).

---

## 3. Adminer & Redis Commander

- Démarrés uniquement avec **`make up`** (`--profile dev`).
- **`make up-lean`** : stack **sans** ces deux services (pas d’UI web Postgres/Redis sur l’hôte).
- En **production** : ne pas activer ce profil ; voir `docker-compose.prod.yml` et [SERVICES.md](../architecture/SERVICES.md).

---

## 4. Périmètre futur (reverse proxy unique)

Aujourd’hui le **navigateur** appelle souvent directement `api-gateway` (`PORT_GATEWAY`) + le dashboard (`PORT_DASHBOARD`). Une évolution possible : **un seul point d’entrée TLS** (Caddy / nginx / Traefik — gabarits dans [../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)) qui route vers les services **sans** exposer chaque port microservice sur Internet. Cela reste une **décision d’hébergement** ; le dev local peut garder les 60XX.

---

*Dernière mise à jour : 2026-05-15.*
