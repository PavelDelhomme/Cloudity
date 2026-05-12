# Vérification après modifications (agent / humain)

À appliquer dès qu’un changement touche le **frontend**, **Docker**, la **gateway**, l’**auth**, les **migrations** ou les **données**.

## 1. Compilation & tests automatisés

- **Frontend** : `cd frontend && npm install` puis `npm run build` (ou `cd frontend/apps/cloudity-web && command npx vite build`) ; **Vitest** : `npm run test -w @cloudity/web` ou `make test-dashboard`.
- **Stack complète unitaire** : `make test` (Go, pytest, Vitest dans le service **`cloudity-web`**).
- **E2E** (stack déjà up + compte démo) : `make up`, `make seed-admin`, attendre ~30 s, puis **`make test-e2e`** et **`make test-e2e-playwright`**.

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
