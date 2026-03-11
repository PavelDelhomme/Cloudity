# Tests Cloudity

## Vue d’ensemble

- **`make test`** : tests unitaires et applicatifs uniquement (sans E2E).
- **`make tests`** : tout (unit/app + E2E health + E2E Playwright + sécurité). Rapport dans `reports/`.

## Couverture des tests unitaires / API

### Backend (Go)

Chaque service a ses propres tests unitaires, lancés par `make test` :

| Service | Ce qui est testé |
|--------|-------------------|
| **auth-service** | Health, hash mot de passe, JWT (génération/parsing/refresh), register, login, validate, 2FA |
| **api-gateway** | Health, CORS, routage /auth, /admin, /pass, /mail (proxy vers les services) |
| **password-manager** | Health, Pass vaults (user_id requis / rejet invalide) |
| **mail-directory-service** | Health, mail/health, domains (tenant_id), mailboxes, aliases, me/accounts |
| **calendar-service** | Health, events (auth requise) |
| **notes-service** | Health, notes (auth requise) |
| **tasks-service** | Health, tasks/lists (auth requise) |
| **drive-service** | Health, nodes, nodes/recent, nodes/trash, nodes/:id/content (GET/PUT), auth requise |

Les tests du gateway vérifient que les préfixes sont bien routés (les appels proxy vers les backends échouent en environnement de test sans réseau Docker, mais le test considère que le routage est correct si la requête est bien envoyée).

### Admin API (Python, pytest)

- **admin-service** : health, stats, tenants (CRUD, validation), users (list, get, update, validation).  
  Exécuté dans un conteneur avec Postgres/Redis.

### Frontend (Vitest)

- **api.test.ts** : appels API (fetch) pour tenants, users, stats, vaults, domains, auth (login, register, refresh), Drive (nodes, content GET/PUT, move, create file, recent), Mail (accounts, sync, send). Vérifie les URLs, headers, et réponses mockées.
- **DrivePage.test.tsx** : page Drive (grille/liste, sélection, menu trois points, renommage, corbeille, aperçu, upload).
- Autres pages : Login, Dashboard, AppHub, Pass, Mail, Office, Editor, etc.

Les tests frontend qui appellent l’API utilisent des mocks (`vi.mock('./api')`), donc ils ne dépendent pas d’un backend réel. L’intégration réelle avec l’API est couverte par les E2E (Phase 2 et 3).

## E2E

- **Phase 2 (make test-e2e)** : santé des services sur les ports 60XX (Gateway, Auth, Admin, Pass, Mail, Drive, Dashboard) et appels réels au gateway (login démo, validate 401). **Pas d’erreur attendue** : les requêtes ciblent localhost:6080 (gateway) et les services dans Docker.
- **Phase 3 (make test-e2e-playwright)** : scénarios navigateur (login, Hub, Drive, Office, Pass, Mail, Editor) avec stack démarrée et compte démo.

## Sécurité (make test-security)

- npm audit (admin-dashboard), safety (admin-service), govulncheck (backends Go), vérification 401 sur /auth/validate.

### Avertissements connus

- **npm audit** : `vite` est monté en 4.5.12 (correctifs sécurité). `xlsx` peut afficher des vulnérabilités sans correctif disponible ; à traiter plus tard (ex. alternative ou mise à jour du paquet).
- **govulncheck** : vulnérabilités stdlib Go (go1.23.x) ; les corriger en mettant à jour la version de Go dans les images Docker lorsque des versions patchées sont disponibles.
