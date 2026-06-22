# Ports hôte (dev Docker) — une source de vérité

**Objectif** : comprendre **quel service** écoute **où** sur la machine hôte, et comment **changer** les ports sans éditer partout le `docker-compose.yml` (variables dans **`.env`** à la racine du dépôt — Docker Compose les charge automatiquement).

**Référence conteneurs** : [../architecture/SERVICES.md](../architecture/SERVICES.md).

**Récap à l’écran** : **`make status`** · **`make check-ports`** (ports libres) · **`make ports-sequential`** (migration `.env` depuis ancienne série 6080…).

---

## 1. Série séquentielle (défaut — PORT-ORG-01)

| Variable | Port hôte | Service | Port **interne** |
|----------|-----------|---------|------------------|
| `PORT_DASHBOARD` | **6001** | cloudity-web | 3000 |
| `PORT_GATEWAY` | **6002** | api-gateway | 8000 |
| `PORT_AUTH` | **6003** | auth-service | 8081 |
| `PORT_ADMIN` | **6004** | admin-service | 8082 |
| `PORT_MAIL_DIRECTORY` | **6005** | mail-directory-service | 8050 |
| `PORT_PASS_MGR` | **6006** | passwords-service | 8051 |
| `PORT_CALENDAR` | **6007** | calendar-service | 8052 |
| `PORT_NOTES` | **6008** | notes-service | 8053 |
| `PORT_TASKS` | **6009** | tasks-service | 8054 |
| `PORT_DRIVE` | **6010** | drive-service | 8055 |
| `PORT_CONTACTS` | **6011** | contacts-service | 8056 |
| `PORT_PHOTOS` | **6012** | photos-service | 8057 |
| `PORT_POSTGRES` | **6042** | postgres | 5432 |
| `PORT_REDIS` | **6079** | redis | 6379 |
| `PORT_ADMINER` | **6083** | adminer (profil **dev**) | 8080 |
| `PORT_REDIS_COMMANDER` | **6084** | redis-commander (profil **dev**) | 8081 |

Migration depuis l’ancienne série (gateway `6080`, microservices `605x`) :

```bash
make ports-sequential    # met à jour .env + VITE_API_URL
make down && make up
make check-ports
```

**Aligner** aussi `VITE_API_URL`, `CLOUDITY_MOBILE_GATEWAY_URL`, `GOOGLE_OAUTH_REDIRECT_URI` (fait par `make ports-sequential`).

Source unique : `scripts/dev/ports-sequential.sh` · défauts compose : `docker-compose.yml` · Makefile : `PORT_* ?= …`.

Overlays : `docker-compose.dev.yml`, `docker-compose.https.yml`, `docker-compose.preprod.yml`, `docker-compose.prod.yml`, `docker-compose.security.yml`, `docker-compose.services.yml`.

### Ancienne série (référence historique)

| Ancien | Nouveau |
|--------|---------|
| 6080 gateway | 6002 |
| 6081 auth | 6003 |
| 6082 admin | 6004 |
| 6050 mail | 6005 |
| 6051 passwords | 6006 |
| … | 6007–6012 |

---

## 2. Makefile vs `.env`

- **`docker compose`** lit `.env` pour les variables du tableau ci-dessus.
- Le **Makefile** définit les **mêmes** valeurs par défaut (`PORT_* ?= …`) pour `make health`, `make seed-admin`, etc.

---

## 3. Adminer & Redis Commander

- Démarrés uniquement avec **`make up`** (`--profile dev`).
- **`make up-lean`** : stack **sans** ces deux services.

---

## 4. Périmètre futur (reverse proxy unique)

Voir [../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md).

---

*Dernière mise à jour : 2026-06-22.*
