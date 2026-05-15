# Vérification après modifications (agent / humain)

À appliquer dès qu’un changement touche le **frontend**, **Docker**, la **gateway**, l’**auth**, les **migrations** ou les **données**.

**Avant toute chose** : **[INSTRUCTIONS-IA.md](../INSTRUCTIONS-IA.md)** (checklist + journal **[LOGS.md](../LOGS.md)** ; exception `NPNLD`).

## 0. Checklist globale — avant chaque reprise de travail

À lancer **dans l’ordre** (ou au minimum les deux premiers) pour repartir sur une base saine. Les items **partiels** du produit (extension Pass sans autofill, Calendar placeholder, etc.) sont listés dans **[BACKLOG.md](../../BACKLOG.md)** et **[docs/produit/ROADMAP.md](../produit/ROADMAP.md)** — ce n’est **pas** une erreur de config locale si une case reste décochée.

| # | Vérification | Commande / action |
|---|----------------|-------------------|
| 1 | Docker disponible | `docker info` |
| 2 | **Tests merge (obligatoire avant PR)** | **`make test`** (Go + Vitest dans Docker, **sans** E2E — voir **[TESTS.md](TESTS.md)** § 1) |
| 3 | Optionnel — lint front | `make test-dashboard-lint` |
| 4 | Optionnel — E2E navigateur (stack up) | `make up` → attente ~30 s → `make seed-admin` → **`make test-e2e-playwright`** (et **`make test-e2e-playwright-mail`** si PR Mail) |
| 5 | Optionnel — Pass mobile | `cd mobile/pass && flutter test` |
| 6 | Compose modifié | `docker compose -f docker-compose.yml config` |
| 7 | Lire les priorités | **[STATUS.md](../../STATUS.md)** (*À faire maintenant*) + **[TODOS.md](../../TODOS.md)** + **[BACKLOG.md](../../BACKLOG.md)** |

> **Note Vitest / Web Crypto** : les tests TOTP (`totp.ts`) utilisent `crypto.subtle` ; les buffers passés à `sign()` doivent être des **`Uint8Array`** / vues valides pour Node — en cas de régression, voir l’historique `totp.ts` (`hotp`).

## 1. Compilation & tests automatisés

- **Frontend (recommandé — même environnement que la CI)** : **`make test-dashboard`** (Vitest dans Docker) ; lint : **`make test-dashboard-lint`** ; dépendances après changement de `package.json` : **`make dashboard-npm-install`** ou **`make frontend-install`** à la racine `frontend/`. Éviter `cd frontend && npm run build` sur l’hôte **sauf** besoin IDE ponctuel.
- **Stack complète unitaire** : **`make test`** (Go, pytest, Vitest dans le service **`cloudity-web`**).
- **E2E** (stack déjà up + compte démo) : **`make up`** (ou **`make up-lean`** sans Adminer/Redis Commander — voir **[PORTS-HOTES.md](PORTS-HOTES.md)**), **`make seed-admin`**, attendre ~30 s, puis **`make test-e2e`** et **`make test-e2e-playwright`**.

> **Important — accès admin (`/4dm1n`)** : la **gateway** et le **`AdminAccessGate`** front exigent désormais un **claim `role: "admin"`** dans le JWT. **`make seed-admin`** crée le compte **`admin@cloudity.local` / `Admin123!`** et **promeut** le user en `role='admin'` dans la BDD. Si tu étais déjà connecté avec un ancien JWT (sans `role`), **déconnecte-toi puis reconnecte-toi** (ou attends un refresh) pour récupérer un token avec le claim. Dans le cas contraire, l’UI redirige vers `/app` et l’API gateway répond `403 admin role required`.

## 2. Comportement attendu dans le navigateur

Après **`make up`**, vérifier manuellement ou avec l’outil navigateur :

| URL | Attendu |
|-----|---------|
| `http://localhost:6001/` | Landing / shell utilisateur (`index.html`) |
| `http://localhost:6001/app` | Hub (connecté) ou redirection login |
| `http://localhost:6001/4dm1n` | **admin.html** chargé (bundle admin) : la page ne doit pas être une 404 Vite ; HTML contient `main-admin` |
| `http://localhost:6001/admin` | **404** explicite (pas de redirection vers `/4dm1n` — anti-énumération, cf. **[../securite/AUDIT-SECURITE.md](../securite/AUDIT-SECURITE.md)** § 1) |

En **dev**, Vite réécrit **`/4dm1n`** vers **`/admin.html`** via un plugin **`enforce: 'pre'`** (`vite.config.js`) et renvoie **404** sur tout `GET /admin*` (idem côté image nginx prod, `frontend/apps/cloudity-web/nginx.conf`).

### 2.b HTTPS local (option)

- **Prérequis** : [`mkcert`](https://github.com/FiloSottile/mkcert) installé (Arch : `sudo pacman -S mkcert`).
- Démarrer la stack backend (`make up`) puis : **`make dev-https`**. Vite sert l’app sur **`https://localhost:5173`** (certificat local mkcert).
- Le certificat est généré dans **`.certs/`** (ignoré par Git) ; on peut le régénérer en supprimant le dossier.
- Inspecter une requête admin :
  ```bash
  curl -ksS -H "Origin: https://localhost:5173" -H "Authorization: Bearer <jwt admin>" \
    https://localhost:5173/admin/stats
  ```
- Limites : ce mode `dev-https` ne lance **pas** de TLS sur la gateway (`http://localhost:6080` reste en clair). Pour TLS de bout en bout local, prévoir un reverse-proxy local (Caddy / NPM dev) — voir **[../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)**.

## 3. Checks rapides sans navigateur

- **`make quick-check`** et **`make health`** incluent une requête **`/4dm1n`** et contrôlent la présence du script admin.

## 3b. Redis (warning « Memory overcommit »)

Réglage **noyau hôte Linux** : **`vm.overcommit_memory=1`**. Voir **[DEVELOPMENT-HOST.md](DEVELOPMENT-HOST.md)** ; commande : **`make host-redis-sysctl`** (puis **`make host-redis-sysctl APPLY=1`** si besoin).

## 4. Non-régression Docker

- Valider le fichier : `docker compose -f docker-compose.yml config`.
- **`cloudity-web`** monte `./frontend` sur **`/ws`** et un volume **`node_modules_cache`** sur **`/ws/node_modules`**. Au démarrage, la commande Compose exécute **`npm install` à la racine `/ws`** puis **`npm run dev -w @cloudity/web`** — sans cela le volume `node_modules` est vide et **`:6001` ne répond pas**.
- **`make wait-for-services`** (utilisé par **`make up-full`**) attend les backends **puis** une réponse HTTP sur **`PORT_DASHBOARD`** (6001), jusqu’à ~4 min pour le premier `npm install`.
- **`make down`** utilise **`--remove-orphans`** pour éviter les vieux conteneurs après renommage de service.
- **`make rebuild-dashboard`** reconstruit l’image **`cloudity-web`**.

Voir aussi **[TESTS.md](TESTS.md)** pour le détail des commandes.

## 5. Chantiers rate-limit / anti-spam / stack MTA

Si une PR touche **`api-gateway`** (rate limit), **`mail-directory-service`** (envoi / IMAP), ou les futurs fichiers **Postfix / Dovecot / Rspamd** :

- Relire **[../architecture/ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)** (couches, ordre AS-1 → AS-5).
- Vérifier qu’aucun changement ne **casse l’envoi légitime** (timeouts, fallback si service ML absent) — **[../securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](../securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)**.
- Après montée de charge locale : `make perf-snapshot LABEL=after-antispam-tuning` puis comparer si pertinent (**[PERFORMANCES-MONITORING.md](PERFORMANCES-MONITORING.md)**).
