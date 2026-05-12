# Audit sécurité Cloudity (transverse)

**Périmètre** : au-delà de « admin API », ce document couvre aussi **l’UI admin**, la **gateway**, les **routes mail admin-only**, le **réseau interne**, la **dette historique** (`admin-service`), et les **questions UX JWT** côté navigateur.

**Références code (indicatif)** :
- `backend/api-gateway/main.go` (`adminAPIRequiresSession`, `authMiddleware`, `tokenHasAdminRole`, contrôle `Origin`, ingestion perf)
- `frontend/apps/cloudity-web/src/AdminAccessGate.tsx`, `frontend/apps/cloudity-web/src/AdminApp.tsx`
- `frontend/apps/cloudity-web/{vite.config.js,nginx.conf}` (refus UI `/admin*`)
- `backend/admin-service/routes/stats.py` (`PERFORMANCE_INGEST_TOKEN`)
- Paquet `frontend/packages/cloudity/shared` (`jwtRole.ts`, `apiFetch.ts`)

**Lectures liées** :
- **[MTLS-INTERNE.md](MTLS-INTERNE.md)** — état interne + **cibles** Zero Trust (TLS/mTLS, Postgres, Redis, PKI `step-ca`)
- **[CRYPTO-NORME.md](CRYPTO-NORME.md)** — obligations crypto + trajectoire post-quantique pragmatique
- **[SECURITE.md](SECURITE.md)**, **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)**, **[REVERSE-PROXY.md](REVERSE-PROXY.md)**, **[PASS-CRYPTO.md](PASS-CRYPTO.md)**, **[WEBAUTHN-PLAN.md](WEBAUTHN-PLAN.md)**

---

## 1. UI admin : `/4dm1n` vs `/admin` (obfuscation + anti-énumération)

### 1.1 Ce que `/4dm1n` apporte (et n’apporte pas)

- **Apporte** : réduit l’énumération **facile** (« tout le monde teste `/admin` »).
- **N’apporte pas** : ce n’est **pas** une authentification. Un acteur peut toujours charger le **bundle** s’il devine l’URL ou observe un déploiement.

### 1.2 Politique actuelle : **pas** de redirection `/admin → /4dm1n`

Pour éviter de **confirmer** l’existence du back-office via une redirection prévisible :

- **SPA admin** : ne réécrit pas `/admin*` vers `/4dm1n` (`AdminApp.tsx`).
- **Vite (dev)** : `GET /admin*` → **404** texte simple.
- **Nginx (image web)** : `location ^~ /admin` → **404**.

> Les appels API continuent d’utiliser le préfixe gateway **`/admin/*`** (distinct de l’UI).

### 1.3 « Peut-on empêcher de charger le bundle sans être admin ? »

**Côté navigateur seul** : difficile — si `admin.html` est servi publiquement, le téléchargement du JS reste possible.

**Durcissements utiles (backlog)** :
- **Sous-domaine admin** + **auth avant HTML** (reverse-proxy / BFF) ;
- **déploiement séparé** (moins de surface sur le domaine « app ») ;
- **ACL IP** en bordure (NPM) en complément (voir `docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md`).

---

## 2. API Gateway — `/admin/*` (source de vérité Internet)

### 2.1 JWT + rôle admin

Pour les requêtes sous `/admin` (hors `OPTIONS`) :

1. **`Origin` autorisé** (anti-abus « client inattendu » sur la gateway publique) :
   - si `CORS_ALLOW_LAN=true` : `http(s)://localhost|127.0.0.1` + IPs RFC1918 ;
   - sinon : liste explicite `CORS_ORIGINS` (+ défauts dev `http://localhost:6001`, `http://localhost:5173`).
2. **`Authorization: Bearer`** obligatoire.
3. Vérification **signature** JWT + présence du rôle **admin** (`role: admin` ou `roles[]` contenant `admin`).
4. En succès : enrichissement `X-User-ID` / `X-Tenant-ID` pour le downstream.

### 2.2 `OPTIONS`

Le préflight CORS ne porte souvent pas le Bearer : la gateway laisse passer `OPTIONS` sans exiger JWT (le contrôle réel arrive sur la requête « réelle »).

### 2.3 `POST /admin/performance/pipeline-run` (CI / ingestion)

**Ancienne dette** : exception « sans JWT » = surface trop large.

**État durci** :
- **JWT admin obligatoire** (comme le reste de `/admin/*`) ;
- **second facteur** : `X-Cloudity-Perf-Ingest` comparé à `PERFORMANCE_INGEST_TOKEN` **côté gateway** (en plus de `admin-service`) ;
- `PERFORMANCE_INGEST_TOKEN` doit être **configuré** sur gateway + admin-service (valeur par défaut **dev** dans `docker-compose*.yml` — **à changer en prod**).

**Scripts** : `scripts/ci/report-pipeline-run.sh` exige `CLOUDITY_ACCESS_TOKEN` (ou `CLOUDITY_JWT`) + `CLOUDITY_PERF_INGEST_TOKEN` + `Origin`.

**Piste future (meilleur)** : JWT **scoped** `perf:ingest` (sans rôle `admin`) émis par `auth-service`.

### 2.4 Routes mail « admin only » (`/mail/domains*`, `/mail/mailboxes*`, `/mail/aliases*`)

La gateway impose Bearer + rôle admin et peut propager `X-Admin-Role: admin`.

**Point d’attention « standards »** : ne pas supposer qu’un header `X-Admin-Role` suffit si un service est joignable **sans** passer par la gateway. Objectif : **double validation** (gateway + service) + **mTLS** quand le réseau interne n’est pas encore Zero Trust.

---

## 3. `admin-service` (Python) derrière la gateway : quelle menace ?

- En Docker « simple », le service n’est pas exposé Internet, mais reste joignable **sur le réseau interne**.
- **Dette** : handlers historiques peuvent ne pas revérifier JWT → la politique autoritative Internet est la **gateway**, mais ce n’est **pas** suffisant si le réseau interne est considéré hostile (Zero Trust).

**Recommandation** :
- middleware Python **uniforme** (JWT signature) ;
- **mTLS** vers `admin-service` ;
- Postgres/Redis en **TLS** (cf. `MTLS-INTERNE.md`).

---

## 4. Cohérence UI ↔ serveur

### 4.1 `AdminAccessGate` décode le JWT sans vérifier la signature

**Question** : faut-il vérifier la signature dans le navigateur ?

**Réponse** : **non** comme garantie de sécurité (surface crypto, clés publiques, rotation, UX). Le décodage sert l’**UX** ; la **vérité** est serveur (gateway + services).

Optionnel : endpoint `/auth/validate` pour une UX « confirmée serveur » sans sur-interpréter le JWT local.

### 4.2 Logout `/4dm1n` → `/login` en navigation pleine page

**Oui** : c’est une bonne pratique lorsque l’admin est un **bundle séparé** (`admin.html`) : évite un état React incohérent entre shells.

### 4.3 Comptes démo / prod : claims JWT

Les JWT doivent aligner la gateway : `role` ou `roles` contenant **`admin`** pour le back-office.

---

## 5. Erreurs HTTP (401/403/404) — qu’est-ce qui est « normal » ?

Sous `/admin/*` via gateway, il est fréquent d’observer surtout :
- **401** : pas de Bearer / JWT invalide / jeton d’ingestion perf invalide ;
- **403** : JWT OK mais pas admin, ou `Origin` interdit.

**API** : privilégier des erreurs JSON **stables** et peu bavardes. Des pages HTML dédiées par code HTTP sont surtout pertinentes pour l’**UI** (pas pour l’API).

---

## 6. Synthèse risques / recommandations (mise à jour)

| Zone | État actuel | Recommandation |
|------|-------------|----------------|
| UI `/admin*` | refus explicite (pas de redirection) | Garder ; compléter par déploiement/admin subdomain si menace élevée |
| `/admin/*` via Internet | JWT admin + `Origin` + ingestion perf durcie | Ajouter token scoped CI + mTLS interne |
| Réseau Docker interne | HTTP/plain + DB souvent `sslmode=disable` | **TLS + mTLS** (cf. `MTLS-INTERNE.md`) |
| `admin-service` | confiance gateway | **Revalider JWT** + mTLS |

---

## 6 bis. **HTTPS partout** — état réel + plan de bascule

> **Cible** (Q26 / SECURITE.md § 2 + § 5) : tout flux Cloudity, **interne comme externe**, en TLS 1.3. Plus de canal HTTP plain à terme.

### 6 bis.1 État au 2026-05-12

| Lien | Aujourd'hui | Cible | Cible (court terme) |
|------|-------------|-------|---------------------|
| Browser → edge | HTTP `localhost:6001/6080` (dev) ; HTTPS via `make preprod-up` | TLS 1.3 + HSTS + CSP | **`make up-tls`** par défaut |
| Browser → API | HTTP `localhost:6080` | HTTPS via Caddy | `make up-tls` |
| Vite dev | HTTP (option `make dev-https`) | HTTPS via mkcert | docs `DEV-VERIFICATION.md` |
| Gateway → 11 services | HTTP plain | mTLS strict step-ca | `MTLS_MODE=permissive` puis `strict` |
| Postgres | `sslmode=disable` | `sslmode=verify-ca` puis `verify-full` | **`make up-https-internal`** |
| Redis | requirepass plain | `rediss://` + AUTH | `make up-https-internal` |
| Edge prod | NPM/Caddy + ACME | TLS 1.3 + hybride PQ `X25519MLKEM768` | **[REVERSE-PROXY.md](REVERSE-PROXY.md)** |

### 6 bis.2 Cibles Make livrées

```bash
make up-tls            # stack + Caddy edge — recommandé pour dev "production-like"
make up-https-internal # ↑ + Postgres TLS + Redis TLS via step-ca (PoC fonctionnel)
make https-status      # vérifie en-têtes Caddy + Postgres SHOW ssl + Redis PING tls
make mtls-issue-postgres / mtls-issue-redis  # certs serveurs 720 h via step-ca
```

**Pré-requis HTTPS interne** : `make mtls-up && make seed-mtls` (PKI step-ca démarrée).

### 6 bis.3 Pourquoi **pas encore** strict partout

- Bascule **sans casser** : `MTLS_MODE=permissive` accepte HTTP entrant tant qu'un service legacy n'est pas migré.
- Postgres `sslmode=verify-full` exige que le SAN du cert serveur **corresponde au DNS** de connexion (`postgres`). Le PoC actuel pose `DNS:postgres,DNS:localhost` → ✅ compatible. Bascule `verify-full` après surveillance d'une journée en `verify-ca`.
- Redis 7 supporte `tls-port` mais le client `go-redis` doit recevoir `rediss://` dans l'URL — vérifier sur chaque service Go avant de passer en strict.

### 6 bis.4 Vérifications manuelles HTTPS-first

```bash
# 1) Edge
curl -kI https://app.cloudity.local | grep -iE 'http/|strict-transport|content-security'
# attendu : HTTP/2 200 + Strict-Transport-Security max-age=31536000

# 2) Postgres TLS (depuis l'hôte)
docker exec -t cloudity-postgres psql -U cloudity_admin -d cloudity -c "SHOW ssl;"
# attendu : ssl=on

# 3) Redis TLS
docker exec -t cloudity-redis redis-cli --tls --cacert /run/step/ca.pem -a "$REDIS_PASSWORD" PING
# attendu : PONG
```

> **Tâche backlog** : faire passer `make up-tls` en **alias par défaut de `make up`** une fois que la stabilité HTTPS-first est validée sur 1 sprint complet (cf. **[BACKLOG.md](../../BACKLOG.md)** § Sécurité & infra).

---

## 7. Vérifications manuelles rapides

- `GET /admin/tenants` sans Bearer → **401** `authentication required for admin API`.
- Bearer utilisateur non admin → **403** `admin role required`.
- Bearer admin sans `Origin` (curl) → **403** `admin API: origin not allowed`.
- `POST /admin/performance/pipeline-run` sans `X-Cloudity-Perf-Ingest` → **401** `invalid performance ingest token` (si token configuré).

---

*Toute évolution de `authMiddleware` / politiques UI doit mettre à jour cette page + `STATUS.md` + `BACKLOG.md` (section sécurité).*
