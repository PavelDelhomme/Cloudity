# Déploiement production — VPS public + Portainer + Nginx Proxy Manager

**Rôle** : décrire **comment** Cloudity sera mis en ligne sur un **VPS public** (Portainer + Nginx Proxy Manager — NPM), en s'alignant sur les conventions des autres applications déjà déployées sur le même VPS (NPM partagé, réseaux Docker partagés). Le **dev local** (`docker-compose` à la racine, ports `6080/6001`) reste **complètement séparé** et inchangé.

> Le calendrier de mise en prod est contraint par **[../architecture/HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** (Q15=A : H1 backup RPi avant prod publique). Cette fiche sert de **plan d'attaque** prêt-à-coller le jour J.

---

## 0. Variables à substituer (placeholders)

Cette fiche utilise des **placeholders neutres** ; ils doivent être substitués par tes valeurs réelles **uniquement côté infra (Portainer Stack Variables / `.env.deploy` git-ignored)** — **jamais commités**.

| Placeholder | Valeur attendue | Exemple typique |
|-------------|-----------------|-----------------|
| `<DOMAIN>` | TLD que tu utilises pour Cloudity en prod | `example.org`, `cloudity.io`, … |
| `<NPM_HOST>` | hostname admin de l'instance Nginx Proxy Manager | `npm.<DOMAIN>` |
| `<REGISTRY_OWNER>` | propriétaire GHCR (user / org GitHub) ou ton login Docker Hub si tu choisis cette voie (Q21) | `<your-gh-user>` |
| `<TAG>` | version d'image à déployer | `0.5.0`, `v0.5.0`, `sha-1a2b3c4` |
| `<EDGE_NETWORK>` | réseau Docker `external: true` joignable depuis NPM (Q22=A → souvent `web`) | `web` |
| `<INTERNAL_NETWORK>` | réseau Docker privé pour Postgres / Redis / microservices | `cloudity-data` |

Convention dans tout ce document : on pose **`<DOMAIN>=example.org`** comme défaut de lecture (RFC 2606 — domaine réservé pour la documentation), et **`<REGISTRY_OWNER>=<owner>`**. Les images suivent **Q21=B (GHCR)** : `ghcr.io/<owner>/cloudity-<svc>:<TAG>`.

> **Hygiène secrets** : ne JAMAIS coller dans Git ton vrai TLD, le hostname de ton NPM, ni le nom de ton compte registry. Stocker ces valeurs dans Portainer (Stack Variables) ou un `.env.deploy.local` listé dans `.gitignore`. La validation `gitleaks` (`make secrets-scan`) inclut un scan historique complet (cf. **[../securite/SECRETS.md](../securite/SECRETS.md)**).

---

## 1. Conventions du VPS cible (à respecter)

Le scénario type est : **un VPS public** déjà occupé par d'autres applications conteneurisées, avec **Nginx Proxy Manager** (NPM) en frontal partagé qui fait le TLS Let's Encrypt et route par hostname vers les services applicatifs derrière. Cloudity vient s'y greffer **sans casser** les stacks existantes.

| Bloc | Convention attendue | Implication pour Cloudity |
|------|---------------------|---------------------------|
| **Registry** | GHCR (Q21=B livré) → `ghcr.io/<owner>/cloudity-<svc>:<TAG>` | 12 images publiées par le workflow GHA `docker-publish.yml`. |
| **Stacks Portainer** | Une stack par domaine produit (Q7=C). | 8 stacks Cloudity à créer (cf. § 3). |
| **Réseaux Docker partagés** | NPM est typiquement branché à un (ou plusieurs) **bridge external** dont on hérite (`<EDGE_NETWORK>`). | La gateway Cloudity et le front rejoignent ce réseau ; les microservices internes restent sur `<INTERNAL_NETWORK>` privé. Q22=A → réutiliser le réseau edge existant. |
| **NPM** | Une seule instance, hostname admin `<NPM_HOST>`. | Pour chaque sous-domaine Cloudity, créer un **Proxy Host** pointant vers `http://<container_name>:<port>`. |
| **Pattern domaine** | `<app>.<DOMAIN>` ou `<sub>.<app>.<DOMAIN>`. Q23=A → `cloudity.<DOMAIN>` + `api.cloudity.<DOMAIN>` + `admin.cloudity.<DOMAIN>`. | Voir § 8. |
| **Health checks** | `wget --spider http://localhost:<port>/health` toutes les 30 s. | Déjà présents en dev — à conserver. |
| **`container_name`** | Toujours explicite et stable. | NPM résout par `container_name`, pas par le nom de service Compose. **Ne pas omettre** `container_name:`. |

> **Important** : NPM résout les services backend par leur **`container_name`**, pas par le nom de service Compose. Donc `container_name: cloudity-api-gateway` côté Compose ⇒ Proxy Host NPM cible `cloudity-api-gateway:8000`.

---

## 2. Schéma cible (Cloudity en production)

```
Internet
  │ HTTPS — Let's Encrypt géré par NPM
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Nginx Proxy Manager (instance partagée : <NPM_HOST>)             │
│  Branché sur : <EDGE_NETWORK> (Q22=A)                             │
└──────┬────────────┬───────────────┬──────────────────────────────┘
       │            │               │
       │ http       │ http          │ http
       ▼            ▼               ▼
api.cloudity   app.cloudity    admin.cloudity
   .<DOMAIN>      .<DOMAIN>       .<DOMAIN>
       │            │               │
       ▼            ▼               ▼
┌──────────────────┐ ┌──────────────────────────────────────────────┐
│ cloudity-api-    │ │ cloudity-web :3000  (image nginx statique en │
│   gateway :8000  │ │  prod, ou Vite preview server selon § 6)     │
└────────┬─────────┘ └──────────────────────────────────────────────┘
         │
         │ HTTP (réseau interne `cloudity-data`)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ Stacks Cloudity (postgres + redis + microservices)                │
│  • cloudity-infra      : postgres, redis, db-migrate              │
│  • cloudity-identity   : auth-service, admin-service, api-gateway │
│  • cloudity-mail       : mail-directory-service                   │
│  • cloudity-drive      : drive-service                            │
│  • cloudity-photos     : photos-service                           │
│  • cloudity-pass       : passwords-service                        │
│  • cloudity-comm       : calendar / contacts / notes / tasks      │
│  • cloudity-web        : SPA cloudity-web                         │
└──────────────────────────────────────────────────────────────────┘
       Toutes les stacks rejoignent `cloudity-data` (réseau external).
       Seules `cloudity-identity` (gateway) et `cloudity-web` rejoignent
       en plus le réseau **edge** (cf. Q22) que NPM peut atteindre.
```

---

## 3. Découpage des stacks (Q7=C)

| Stack | Conteneurs | Réseau interne | Exposé NPM ? |
|-------|-----------|----------------|--------------|
| **`cloudity-infra`** | `cloudity-postgres` (15-alpine), `cloudity-redis` (7-alpine), `cloudity-db-migrate` (one-shot) | `cloudity-data` (external, créé par cette stack la 1re fois) | ❌ jamais (DB privée) |
| **`cloudity-identity`** | `cloudity-auth-service`, `cloudity-admin-service` (Python FastAPI), `cloudity-api-gateway` | `cloudity-data` + edge | ✅ `api.cloudity.<DOMAIN>` → `cloudity-api-gateway:8000` |
| **`cloudity-mail`** | `cloudity-mail-directory-service` | `cloudity-data` | ❌ (passe par gateway) |
| **`cloudity-drive`** | `cloudity-drive-service` | `cloudity-data` | ❌ |
| **`cloudity-photos`** | `cloudity-photos-service` | `cloudity-data` | ❌ |
| **`cloudity-pass`** | `cloudity-passwords-service` | `cloudity-data` | ❌ |
| **`cloudity-comm`** | `cloudity-calendar-service`, `-contacts-service`, `-notes-service`, `-tasks-service` | `cloudity-data` | ❌ |
| **`cloudity-web`** | `cloudity-web` (image statique nginx + bundle React buildé) | `cloudity-data` (option) + edge | ✅ `app.cloudity.<DOMAIN>` + `admin.cloudity.<DOMAIN>` → `cloudity-web:3000` |
| **`cloudity-backup`** | runner backup distribué (cf. **[BACKUP-OFFSITE.md](../architecture/BACKUP-OFFSITE.md)**) | `cloudity-data` | ❌ (interne) |

> **Ordre de déploiement** : `cloudity-infra` d'abord (pour créer le réseau `cloudity-data` + lancer DB) → migrations → `cloudity-identity` → un par un les autres.

---

## 4. Réseau « edge » (Q22=A — acté)

**Décision actée** : réutiliser le **réseau Docker `external: true` déjà branché à NPM** (variable `<EDGE_NETWORK>`, valeur typique `web`). Zéro changement côté NPM. Trois options envisagées initialement :

| Option | Avantage | Inconvénient |
|--------|----------|--------------|
| **A. Réutiliser le réseau edge existant** *(actée)* | Zéro changement côté NPM, c'est déjà connecté. | Cohabitation avec d'autres applications sur le même bridge — acceptable (isolation faible mais pas critique, elles ne se parlent pas). |
| **B. Réutiliser un autre bridge external partagé** | Cohérent si plusieurs stacks ont migré sur ce réseau. | Idem A mais autre nom ; pas de gain particulier. |
| **C. Créer un réseau dédié `cloudity-edge`** | Isolation totale entre stacks publiques. | Il faut **brancher NPM** à ce nouveau réseau (Portainer → conteneur NPM → "Networks" → join `cloudity-edge`). |

Dans tous les cas, le réseau **edge** est déclaré en `external: true` côté Compose ; **il ne doit pas être recréé** par la stack Cloudity.

---

## 5. Registry images (Q21=B — GHCR — acté)

**Décision actée** : **GHCR** (GitHub Container Registry). Auth via `GITHUB_TOKEN` natif (zéro secret à provisionner côté repo). Convention :

```
ghcr.io/<REGISTRY_OWNER>/cloudity-api-gateway:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-auth-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-admin-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-mail-directory-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-drive-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-photos-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-passwords-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-calendar-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-contacts-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-notes-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-tasks-service:<TAG>
ghcr.io/<REGISTRY_OWNER>/cloudity-frontend:<TAG>
```

- **Tag immuable `:<TAG>`** par release (`v0.x.y`, `0.x.y`, `0.x`, ou `sha-<short>`) — facilite le rollback.
- Alias **`:latest`** automatique sur la branche par défaut.
- Si le repo Cloudity reste **privé**, fournir à Portainer un PAT GHCR (`docker login ghcr.io -u <user> -p <PAT_read:packages>`) ou rendre les packages publics côté GitHub Settings → Packages.
- **Alternative écartée** : Docker Hub (Q21=A) — voir § 9.4 pour la procédure de bascule éventuelle.

---

## 6. Frontend prod : Vite **build** + nginx (pas le serveur dev)

En dev, `cloudity-web` lance `npm run dev` (Vite avec HMR sur :3000). En prod, on **construit** la SPA et on la sert avec **nginx-alpine** dans une petite image. C'est le pattern standard pour un front Vite/React derrière NPM.

```Dockerfile
# frontend/apps/cloudity-web/Dockerfile.prod (à créer)
FROM node:20-alpine AS build
WORKDIR /ws
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/apps/cloudity-web ./apps/cloudity-web
COPY frontend/packages ./packages
RUN npm ci && npm run build -w @cloudity/web

FROM nginx:1.27-alpine
COPY --from=build /ws/apps/cloudity-web/dist /usr/share/nginx/html
COPY frontend/apps/cloudity-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

**`VITE_API_URL`** est résolu **au moment du build** (donc passé en `--build-arg`) → la valeur de prod est **`https://api.cloudity.<DOMAIN>`** (Q23=A). Une rebuild est nécessaire à chaque changement de cette URL (rare).

---

## 7. Snippets Compose prêt-à-coller (squelette)

> Versions complètes à figer le jour du déploiement (variables, secrets, volumes nommés). Les snippets ci-dessous donnent **la structure réseau + container_name** alignée sur tes conventions VPS.

### 7.1 Stack `cloudity-infra` (le réseau `cloudity-data` est créé ICI)

```yaml
services:
  cloudity-postgres:
    image: postgres:15-alpine
    container_name: cloudity-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - cloudity_postgres_data:/var/lib/postgresql/data
    networks: [cloudity-data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5

  cloudity-redis:
    image: redis:7-alpine
    container_name: cloudity-redis
    restart: unless-stopped
    command: ["sh", "-c", "redis-server --requirepass \"$$REDIS_PASSWORD\" --appendonly yes"]
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    volumes:
      - cloudity_redis_data:/data
    networks: [cloudity-data]

volumes:
  cloudity_postgres_data:
    name: cloudity_postgres_data
  cloudity_redis_data:
    name: cloudity_redis_data

networks:
  cloudity-data:
    driver: bridge
    name: cloudity-data       # créé par cette stack ; les autres le déclareront external: true
```

### 7.2 Stack `cloudity-identity` (auth + admin + gateway → exposée via NPM)

```yaml
services:
  cloudity-auth-service:
    image: ghcr.io/${REGISTRY_OWNER}/cloudity-auth-service:${TAG:-latest}
    container_name: cloudity-auth-service
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@cloudity-postgres:5432/${POSTGRES_DB}?sslmode=disable
      - REDIS_URL=cloudity-redis:6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - ACCESS_TOKEN_DURATION_MINUTES=60
      - ARGON2_MEMORY_KB=65536
      - ARGON2_TIME=3
      - ARGON2_PARALLELISM=4
      # Persistance des paires JWT entre redéploiements (sinon chaque rebuild
      # invalide TOUS les tokens existants). Cf. backend/auth-service/main.go
      # `keyDir()` + tests `TestKeyDirOverrideWritesAndReloadsEd25519/RSA`.
      - AUTH_KEYS_DIR=/var/lib/cloudity/auth-keys
    volumes:
      - cloudity_auth_keys:/var/lib/cloudity/auth-keys
    networks: [cloudity-data]
    healthcheck:
      test: ["CMD", "wget", "-q", "-O/dev/null", "http://127.0.0.1:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  cloudity-admin-service:
    image: ghcr.io/${REGISTRY_OWNER}/cloudity-admin-service:${TAG:-latest}
    container_name: cloudity-admin-service
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@cloudity-postgres:5432/${POSTGRES_DB}
      - REDIS_URL=cloudity-redis:6379
      # OBLIGATOIRE : sans ce token, POST /admin/performance/pipeline-run renvoie 503.
      # Doit être identique à PERFORMANCE_INGEST_TOKEN sur cloudity-api-gateway.
      - PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}
    networks: [cloudity-data]
    depends_on: [cloudity-auth-service]

  cloudity-api-gateway:
    image: ghcr.io/${REGISTRY_OWNER}/cloudity-api-gateway:${TAG:-latest}
    container_name: cloudity-api-gateway
    restart: unless-stopped
    environment:
      - PORT=8000
      - AUTH_SERVICE_URL=http://cloudity-auth-service:8081
      - ADMIN_SERVICE_URL=http://cloudity-admin-service:8082
      - PASSWORDS_SERVICE_URL=http://cloudity-passwords-service:8051
      - MAIL_DIRECTORY_SERVICE_URL=http://cloudity-mail-directory-service:8050
      - CALENDAR_SERVICE_URL=http://cloudity-calendar-service:8052
      - CONTACTS_SERVICE_URL=http://cloudity-contacts-service:8056
      - NOTES_SERVICE_URL=http://cloudity-notes-service:8053
      - TASKS_SERVICE_URL=http://cloudity-tasks-service:8054
      - DRIVE_SERVICE_URL=http://cloudity-drive-service:8055
      - PHOTOS_SERVICE_URL=http://cloudity-photos-service:8057
      - CORS_ORIGINS=https://app.cloudity.${DOMAIN},https://admin.cloudity.${DOMAIN}
      - CORS_ALLOW_LAN=false                                              # prod : Origin strict
      - JWT_PUBLIC_KEY_PATH=/var/lib/cloudity/auth-keys/public.pem
      - JWT_ED25519_PUBLIC_KEY_PATH=/var/lib/cloudity/auth-keys/public_ed25519.pem
      # OBLIGATOIRE : doit valoir la même chose côté cloudity-admin-service
      - PERFORMANCE_INGEST_TOKEN=${PERFORMANCE_INGEST_TOKEN}
    volumes:
      - cloudity_auth_keys:/var/lib/cloudity/auth-keys:ro
    networks:
      - cloudity-data                          # parle aux microservices internes
      - web                                    # joignable depuis NPM (cf. Q22)
    depends_on:
      - cloudity-auth-service
      - cloudity-admin-service
    healthcheck:
      test: ["CMD", "wget", "-q", "-O/dev/null", "http://127.0.0.1:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  cloudity_auth_keys:
    name: cloudity_auth_keys

networks:
  cloudity-data:
    external: true                             # créé par cloudity-infra
    name: cloudity-data
  web:
    external: true                             # déjà existant sur ton VPS
    name: web
```

### 7.3 Stack `cloudity-web` (SPA → exposée via NPM)

```yaml
services:
  cloudity-web:
    image: ghcr.io/${REGISTRY_OWNER}/cloudity-frontend:${TAG:-latest}
    container_name: cloudity-web
    restart: unless-stopped
    networks: [web]                            # pas besoin de cloudity-data : tout passe via gateway
    healthcheck:
      test: ["CMD", "wget", "-q", "-O/dev/null", "http://127.0.0.1:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  web:
    external: true
    name: web
```

### 7.4 Stack métier type (ex. `cloudity-mail`)

```yaml
services:
  cloudity-mail-directory-service:
    image: ghcr.io/${REGISTRY_OWNER}/cloudity-mail-directory-service:${TAG:-latest}
    container_name: cloudity-mail-directory-service
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@cloudity-postgres:5432/${POSTGRES_DB}?sslmode=disable
      - REDIS_URL=cloudity-redis:6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - ALIAS_ENCRYPTION_KEY=${ALIAS_ENCRYPTION_KEY}     # AES-256 base64 32 octets
    networks: [cloudity-data]                   # PAS de réseau edge — passe par la gateway
    healthcheck:
      test: ["CMD", "wget", "-q", "-O/dev/null", "http://127.0.0.1:8050/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  cloudity-data:
    external: true
    name: cloudity-data
```

Reproduire ce gabarit pour `cloudity-drive`, `cloudity-photos`, `cloudity-pass`, `cloudity-comm` (4 services dans le même stack) en changeant les ports / variables.

---

## 8. NPM — Proxy Hosts à créer

| Hostname | Forward Hostname / IP | Port | SSL | Remarques |
|----------|-----------------------|------|-----|-----------|
| `api.cloudity.<DOMAIN>` | `cloudity-api-gateway` | `8000` | Let's Encrypt + **Force SSL** + **HSTS** | Cache OFF ; Block Common Exploits ON ; Websockets ON (futur SSE / WS). |
| `app.cloudity.<DOMAIN>` | `cloudity-web` | `3000` | Let's Encrypt + Force SSL + HSTS | Websockets ON si Vite preview ; OFF si nginx pur. |
| `admin.cloudity.<DOMAIN>` | `cloudity-web` | `3000` | Let's Encrypt + Force SSL + HSTS | Idéal : **ACL IP** côté NPM + **2FA + WebAuthn** côté app (cf. **[../securite/AUDIT-SECURITE.md](../securite/AUDIT-SECURITE.md)** + **[../securite/WEBAUTHN-PLAN.md](../securite/WEBAUTHN-PLAN.md)**). |

**Custom locations / advanced** (NPM → onglet "Advanced") — durcissement supplémentaire si NPM le permet :

```nginx
# api.cloudity.<DOMAIN> — onglet Advanced
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
proxy_read_timeout 90;
proxy_request_buffering off;
client_max_body_size 200m;          # gros uploads Drive/Photos
```

> Si l'instance NPM (`<NPM_HOST>`) tourne sous une image récente, cocher **HTTP/2** (déjà le défaut) et tester `HTTP/3` (UDP/443) selon la version — cf. **[../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)** § 2 et § 4 bis.

---

## 9. Build & push images — flux GitHub Actions (Q24=A : GHCR)

**Implémenté** dans [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) (push sur `main`/`master`, tags `v*.*.*`, ou déclenchement manuel `workflow_dispatch`). Les images sont publiées sur **GHCR** :

```text
ghcr.io/<owner>/cloudity-api-gateway:<tag>
ghcr.io/<owner>/cloudity-auth-service:<tag>
ghcr.io/<owner>/cloudity-admin-service:<tag>
ghcr.io/<owner>/cloudity-mail-directory-service:<tag>
…
ghcr.io/<owner>/cloudity-frontend:<tag>
```

Tags appliqués (via `docker/metadata-action@v5`) :

- branche → `:main`, `:master`
- tag git `v0.x.y` → `:0.x.y`, `:0.x`
- SHA court → `:sha-<7chars>` (toujours)
- `:latest` automatique sur la branche par défaut

### 9.1 Dockerfiles utilisés

| Service | Dockerfile | Contexte |
|---------|------------|----------|
| `api-gateway` | `backend/api-gateway/Dockerfile.prod` | `backend/` (replace `../internalsec`) |
| `auth-service` | `backend/auth-service/Dockerfile.prod` | `backend/auth-service/` |
| `passwords-service`, `mail-directory-service`, `calendar-service`, `notes-service`, `tasks-service`, `drive-service`, `contacts-service`, `photos-service` | `backend/Dockerfile.go-service` (générique, multi-stage, distroless) | `backend/<svc>/` |
| `admin-service` | `backend/admin-service/Dockerfile.prod` (Python slim, non-root) | `backend/admin-service/` |
| `frontend` (cloudity-web) | `frontend/apps/cloudity-web/Dockerfile` (déjà multi-stage) | `frontend/` |

### 9.2 Caractéristiques sécurité des images

- **Builds Go** : statique, `-trimpath -ldflags="-s -w" -buildvcs=false` ; runtime `gcr.io/distroless/static-debian12:nonroot` (UID 65532, sans shell, sans busybox, sans `apt`).
- **admin-service** : `python:3.11-slim` runtime, utilisateur `cloudity` (uid 1000) non-root, `libpq5` uniquement (pas de `gcc` en runtime).
- **frontend** : build node:20-alpine puis `nginx:alpine` (déjà en place).

### 9.3 Build local (debug) — sans GHA

```bash
docker build -f backend/auth-service/Dockerfile.prod \
  -t cloudity/auth-service:dev backend/auth-service

docker build -f backend/api-gateway/Dockerfile.prod \
  -t cloudity/api-gateway:dev backend  # contexte = backend/ pour internalsec

docker build -f backend/Dockerfile.go-service \
  --build-arg SERVICE=passwords-service --build-arg PORT=8051 \
  -t cloudity/passwords-service:dev backend/passwords-service

docker build -f backend/admin-service/Dockerfile.prod \
  -t cloudity/admin-service:dev backend/admin-service
```

### 9.4 Anciennes pistes (Docker Hub) — à conserver pour comparaison

```yaml
# Si on bascule plus tard sur Docker Hub, créer ces secrets côté GitHub Actions :
#   DOCKERHUB_USERNAME = <your-dockerhub-user>
#   DOCKERHUB_TOKEN    = jeton read/write Docker Hub
# puis remplacer "registry: ghcr.io" par "registry: docker.io" + adapter le username.
```

---

## 10. Procédure de déploiement (résumé `make` cible)

Le jour J (homelab H1 livré) :

1. **Push code** + tag : `git tag v0.5.0 && git push --tags` → GHA construit et publie 12 images.
2. **Portainer → Add Stack** :
   - `cloudity-infra` (Web Editor : coller § 7.1) + variables d'env (DB password, Redis password, etc.) → **Deploy**.
   - Vérifier que `cloudity-data` est bien créé (Networks).
   - `cloudity-identity` (§ 7.2) avec `TAG=v0.5.0` → **Deploy**.
   - Suite : `cloudity-mail`, `cloudity-drive`, `cloudity-photos`, `cloudity-pass`, `cloudity-comm`, `cloudity-web`.
3. **NPM → Proxy Hosts** : créer les 3 entrées du § 8, cocher Let's Encrypt + Force SSL + HSTS.
4. **Secrets** (variables Portainer) : générer en local **`make secrets`** (cf. `scripts/dev/gen-secrets.sh`), copier les valeurs dans Portainer → Stack → Variables :
   - `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, **`PERFORMANCE_INGEST_TOKEN`** (obligatoire prod), `ALIAS_ENCRYPTION_KEY`.
   - Le **`PERFORMANCE_INGEST_TOKEN`** doit avoir **la même valeur** sur `cloudity-api-gateway` **et** `cloudity-admin-service` ; sinon l'endpoint CI `/admin/performance/pipeline-run` répond 401/503.
5. **Smoke tests** : utiliser **`make smoke-prod`** (cf. **[../../scripts/ops/smoke-prod.sh](../../scripts/ops/smoke-prod.sh)**) en exportant `SMOKE_API_URL=https://api.cloudity.<DOMAIN>` et `SMOKE_APP_URL=https://app.cloudity.<DOMAIN>`. Le script vérifie : `/health` → 200, `/auth/validate` (sans Bearer) → 401, SPA → 200, TLS handshake, HSTS + `X-Content-Type-Options`. Vérifier en plus manuellement que `https://app.cloudity.<DOMAIN>/admin` → **404** (anti-énumération, cf. **[../securite/AUDIT-SECURITE.md](../securite/AUDIT-SECURITE.md)** § 1).
6. **Smoke admin API** : depuis un poste admin (cookie/session valides),
   ```bash
   curl -sS -H "Origin: https://admin.cloudity.<DOMAIN>" \
        -H "Authorization: Bearer <jwt admin>" \
        https://api.cloudity.<DOMAIN>/admin/stats
   ```
   doit renvoyer 200. Sans Origin valide → 403 ; sans JWT admin → 401.
7. **Backup** : confirmer que le runner `cloudity-backup` (cf. [BACKUP-OFFSITE.md](../architecture/BACKUP-OFFSITE.md)) atteint la RPi via WireGuard + Headscale (Q13=B).

---

## 11. Distinction dev local ↔ prod VPS (rappel)

| | Dev local (`make up`) | Prod VPS Portainer |
|---|------------------------|--------------------|
| **Source** | `docker-compose.yml` racine, `build:` depuis `./backend/<svc>` | Stacks Portainer, `image: ghcr.io/<REGISTRY_OWNER>/cloudity-<svc>:<TAG>` |
| **Ports hôte** | 6042 (PG), 6079 (Redis), 6080 (gateway), 6081 (auth), 6001 (web), 6082 (admin), … | **Aucun** (tout interne ; seul NPM publie 80/443/UDP/443) |
| **TLS** | Désactivé (HTTP localhost) | **TLS 1.3** géré par NPM, certs Let's Encrypt |
| **CORS** | `localhost:6001`, `localhost:5173` | `https://app.cloudity.<DOMAIN>`, `https://admin.cloudity.<DOMAIN>` |
| **JWT keys** | `private.pem` + `private_ed25519.pem` générées au boot dans le bind-mount `./backend/auth-service` | Volume Docker nommé `cloudity_auth_keys` (persistant entre redéploiements) |
| **Frontend** | Vite dev server, HMR | Build statique nginx-alpine |
| **DB** | `cloudity-postgres` local, mot de passe trivial | Idem, mots de passe dans variables Portainer (chiffrées au repos) |

---

## 12. Liens utiles

| Sujet | Document |
|-------|----------|
| Découpage stacks, registry, GHA | **[../architecture/MULTI-REPO-LAYOUT.md](../architecture/MULTI-REPO-LAYOUT.md)** § 8 |
| TLS 1.3, HSTS, CSP, HTTP/3, hybride PQ | **[../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)** + **[../securite/CRYPTO-NORME.md](../securite/CRYPTO-NORME.md)** |
| Audit `/4dm1n` (ACL IP + 2FA) | **[../securite/AUDIT-SECURITE.md](../securite/AUDIT-SECURITE.md)** |
| Backup offsite (RPi) | **[../architecture/BACKUP-OFFSITE.md](../architecture/BACKUP-OFFSITE.md)** |
| Homelab bloquant prod (Q15) | **[../architecture/HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** |
| Décisions Q7 / Q15 / Q18–Q19 / Q21–Q24 | **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** |

---

*Fiche calquée sur les conventions standard d'un VPS Portainer + NPM partagé (utilisation de placeholders neutres pour rester partageable). Toute valeur réelle (`<DOMAIN>`, `<NPM_HOST>`, `<REGISTRY_OWNER>`, etc.) est à reporter côté infra (Portainer Stack Variables / `.env.deploy.local` git-ignored), jamais dans Git. Mise à jour 2026-05-12.*
