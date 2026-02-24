# CLOUDITY — Suivi d’avancement et référence projet

**Dernière mise à jour** : 2025-02-24  
**Branche de référence** : `main` (travail basé sur `origin/main`)  
**Document de référence** : ce fichier sert de **référence unique** pour l’avancement et les prochaines étapes.

---

## 0. Démarrage

| Action | Commande |
|--------|----------|
| **Démarrer la stack** | `make up` |
| **Arrêter la stack** | `make down` |
| **Logs en temps réel** | `make logs` |
| **Aide Make** | `make help` |
| **Première fois** | `./scripts/setup.sh` puis `make up` |

**URLs** : Dashboard http://localhost:6001 | API http://localhost:6000 | Adminer http://localhost:6083 | Redis Commander http://localhost:6084

### Tests (à suivre absolument)

| Commande | Rôle |
|----------|------|
| **`make test`** | Lance toute la batterie de tests (unitaires + applicatifs) en local : auth-service (Go), api-gateway (Go), admin-service (pytest), admin-dashboard (vitest). **À exécuter avant de démarrer une nouvelle fonctionnalité.** |
| **`make test-e2e`** | Tests E2E (stack doit être up) : vérifie que chaque service répond (health, dashboard). |
| **`make test-docker`** | Lance les tests dans les conteneurs (après `make up`). |

**Règle** : pour chaque fonctionnalité implémentée, ajouter des tests (unitaires, applicatifs, et si pertinent E2E) exécutables via `make test`. Ne pas merger une feature sans tests associés.

**État (2025-02-24)** : `make up`, `make test`, `make test-e2e`, `make test-docker` vérifiés et passants. Tests admin-service et admin-dashboard exécutés via Docker (reproductibilité).

---

## 1. Ce que je dois faire (priorités)

Section pour **avancer concrètement** : cocher au fur et à mesure.

### Immédiat (base actuelle)

- [x] **Vérifier la stack** : `make up` puis ouvrir http://localhost:6001 et http://localhost:6000/health ; Redis healthy, tous les services démarrent. (Correction Redis : mot de passe passé via shell pour que la variable d’env soit bien utilisée.)
- [ ] **Consolider l’auth** : Argon2id pour les mots de passe, refresh tokens avec rotation, 2FA TOTP opérationnel (auth-service).
- [ ] **Renforcer admin** : admin-service (CRUD users, rôles) ; admin-dashboard (écrans Users/Settings reliés à l’API, logout branché).

### Phase 1 — Password Manager MVP

- [ ] **Backend password-manager** (Go) : API REST (register/login), CRUD vault/items, stockage blobs chiffrés côté client (serveur ne voit que ciphertext).
- [ ] **Schéma DB** : tables/schema `pass` (vaults, collections, items).
- [ ] **App Flutter** (web + desktop Linux) : liste/CRUD mots de passe, déchiffrement côté client.
- [ ] **Extension navigateur** (Brave/Chrome, Manifest v3) : lecture/ajout, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis dans le Compose.
- [ ] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API).
- [ ] **Schéma DB mail** : domains, mailboxes, aliases.
- [ ] **mail-client-api** : wrapper IMAP/SMTP en REST pour l’UI.
- [ ] **Client mail Flutter** (web + Linux) : lecture/envoi, dossiers, étiquettes.

### Phase 3 — Alias + intégration

- [ ] **API alias** dans mail-directory (création alias temp/permanent, expiration).
- [ ] **Extension Pass** : bouton « Créer alias » → appel API → stockage dans le vault.
- [ ] **UI Cloudity** : vue centralisée des alias.

### Phase 4 et après

- [ ] **Mail E2E** (OpenPGP) pour mails Cloudity–Cloudity.
- [ ] **Drive** : service + client (fichiers chiffrés côté client).
- [ ] **Apps mobiles** Mail + Pass (Flutter).
- [ ] **Prod** : Nginx Proxy Manager, TLS 1.3, backups chiffrés.

*Détail des phases et checklist complète : section 5 ci-dessous.*

---

## 2. Vision du projet

Objectif : construire une suite **auto-hébergée, chiffrée et extensible** type :

- **Proton Mail** (mail E2E) + **Proton Pass** (gestionnaire de mots de passe)
- **Gmail** (client mail riche) + **Google Drive** (stockage fichier)

Le tout **dockerisé**, derrière Nginx Proxy Manager (prod) ou Nginx/Traefik en local, avec possibilité de passer en Swarm/K8s plus tard.

### 2.1 Les 4 domaines principaux

| Domaine | Rôle |
|--------|------|
| **Mail Core** | SMTP/IMAP (Postfix + Dovecot), stockage messages, alias, anti-spam (Rspamd), directory (PostgreSQL). |
| **Mail App** | Client web/mobile/Linux (Flutter), recherche, tags/dossiers, règles, rappels. |
| **Password Manager** | Type Bitwarden/Proton Pass : vault chiffré côté client, extensions navigateur, auto-fill, intégration alias mail. |
| **Core Cloudity** | Auth unifiée, comptes/organisations, quotas, futures apps (Drive). |

### 2.2 Stack technique cible (résumé)

- **Backend** : Go (auth, mail-directory, alias, API mail client, futur Drive), Python pour data/ETL si besoin. Postfix/Dovecot/Rspamd en briques externes.
- **Bases** : PostgreSQL (auth, mail, pass, drive), Redis (sessions, Rspamd).
- **Frontend** : Flutter (Web, Linux desktop, mobile Android/iOS) pour Mail + Password Manager ; extensions navigateur en JS/TS (Manifest v3).
- **Sécurité** : TLS 1.3, Argon2id, E2E côté client (vault pass, puis mail OpenPGP), audit logs, backups chiffrés.

---

## 3. Branches et base de travail

- **Branche principale** : `main` (à garder à jour avec `origin/main`).
- **Branches distantes connues** : `develop`, `feature/auth-service`, `release/v0.1`, `hotfix/base-upload`, `cursor/fix-cors-and-api-errors-on-dashboard-a59d`.
- **Recommandation** : travailler à partir de `main`, merger `develop` ou les features une fois validées. Avant de commencer une grosse phase, faire un `git fetch origin` et se baser sur la branche la plus à jour (en général `main`).

---

## 4. État actuel (ce qui existe déjà)

### 4.1 Infrastructure

| Élément | Statut | Note |
|--------|--------|------|
| Docker Compose global | ✅ Présent | `docker-compose.yml` + `docker-compose.services.yml` |
| PostgreSQL 15 | ✅ Présent | Volume, healthcheck ; schéma dans `infrastructure/postgresql/init.sql` |
| Dossier `infrastructure/postgresql/init/` | ✅ En place | `init/01-schema.sql` contient le schéma ; le Compose monte ce dossier. `init.sql` à la racine postgresql conservé pour référence. |
| `postgresql.conf` / `redis.conf` | ✅ Résolu | Mounts retirés du Compose ; Postgres/Redis utilisent la config par défaut → plus d’erreur au démarrage. |
| Redis 7 | ✅ Présent | Mot de passe (command + healthcheck via shell pour expansion `REDIS_PASSWORD`), volume, healthcheck |
| Réseau Docker | ✅ Présent | `cloudity-network` |

### 4.2 Ports (60XX) — exposition host

Tous les **ports exposés sur l’hôte** sont en **60XX** pour éviter les conflits et garder une convention claire. À utiliser dans le navigateur / clients :

| Service | Port host (60XX) | Port conteneur | Accès navigateur / usage |
|---------|------------------|----------------|---------------------------|
| PostgreSQL | 6042 | 5432 | Connexion DB (ex. `localhost:6042`) |
| Redis | 6079 | 6379 | Connexion Redis (ex. `localhost:6079`) |
| auth-service | 6081 | 8081 | Direct (débogage) ; en prod tout passe par la gateway. |
| **api-gateway** | **6000** | 8000 | **API principale** : `http://localhost:6000` (à mettre dans `VITE_API_URL`) |
| admin-service | 6082 | 8082 | Direct (débogage) ; en prod via gateway `/admin/*`. |
| **admin-dashboard** | **6001** | 3000 | **Dashboard web** : `http://localhost:6001` |
| Adminer (profil dev) | 6083 | 8080 | `http://localhost:6083` |
| Redis Commander (profil dev) | 6084 | 8081 | `http://localhost:6084` |

- **CORS** : l’api-gateway autorise `http://localhost:6001` et `http://localhost:5173` (ou `CORS_ORIGINS` dans l’env).
- **Nouveaux services** : exposer en 60XX (ex. mail-directory 6050, pass-manager 6051, mail-client-api 6052, etc.).

### 4.3 Schéma PostgreSQL actuel

- **Tables** : `tenants`, `users`, `sessions`, `audit_logs` (RLS activé).
- **À venir** : schémas/schema séparés ou tables pour **mail** (domains, mailboxes, aliases), **pass** (vaults, items), **drive** (fichiers, meta).

### 4.4 Services backend

| Service | Stack | Statut | Détail |
|---------|--------|--------|--------|
| auth-service | Go (Gin) | 🟡 Partiel | Health, Register/Login/Refresh/2FA/Validate ; JWT RSA. À renforcer (Argon2id, refresh rotation, device binding). |
| api-gateway | Go (Gorilla mux) | ✅ OK | Proxy vers auth et admin, CORS ; exposé host **6000**. |
| admin-service | Python (FastAPI) | ✅ OK | CRUD tenants, health ; exposé host **6082**. |
| mail-directory-service | — | ❌ À faire | Gestion domaines/comptes/alias mail (Phase 2). |
| mail-client-api | — | ❌ À faire | Wrap IMAP/SMTP en REST/GraphQL pour l’UI (Phase 2). |
| password-manager-service | — | ❌ À faire | Backend vault (Phase 1). |
| drive-service | — | ❌ À faire | Phase 4. |

### 4.5 Frontend & mobile

| App | Stack | Statut | Détail |
|-----|--------|--------|--------|
| admin-dashboard | React (Vite, TanStack Query) | ✅ OK | Dashboard, Tenants, Users, Settings ; API via gateway. |
| Mail (web/desktop) | Flutter | ❌ À faire | Phase 2. |
| Password Manager (web/desktop) | Flutter | ❌ À faire | Phase 1. |
| Extensions navigateur (Pass) | JS/TS Manifest v3 | ❌ À faire | Phase 1 (MVP) puis Phase 3 (alias). |
| admin_app (mobile) | Flutter | 🟡 Squelette | Structure de base uniquement. |
| Apps mobiles Mail / Pass | Flutter | ❌ À faire | Après MVP web/desktop. |

### 4.6 Scripts et outillage

- `scripts/setup.sh` : setup initial (dossiers, .env, clés, deps) → puis `make up`.
- `scripts/setup-dev.sh` : deps locales pour dev (Go, Node, Python).
- `scripts/diagnose.sh` : vérification structure + ports 60XX.
- `scripts/fix-project.sh` : réparation .env, go.mod, frontend minimal.
- À prévoir : migrations DB versionnées (ex. golang-migrate ou `infrastructure/postgresql/migrations/*.sql`).

### 4.7 Base pour avancer (à étendre)

| Composant | Rôle | Prochaine étape |
|-----------|------|------------------|
| **admin-dashboard** (React/Vite) | UI admin actuelle | Renforcer (tenants, users, settings) ; servir de modèle pour Mail/Pass UI. |
| **admin-service** (FastAPI) | CRUD tenants, API admin | Étendre (users, rôles) ; même pattern pour mail-directory et password-manager. |
| **auth-service** (Go) | Login, register, JWT, 2FA | Consolider (Argon2id, refresh tokens) puis brancher tous les fronts. |
| **api-gateway** (Go) | Route /auth, /admin, CORS | Ajouter routes /mail, /pass, /drive au fur et à mesure. |

Pour **Mail Core** : ajouter Postfix, Dovecot, Rspamd + **mail-directory-service** (Go) + schéma DB mail.  
Pour **Password Manager** : ajouter **password-manager-service** (Go) + schéma pass + app Flutter + extension navigateur.  
Voir checklist Phase 1 et Phase 2 ci-dessous.

---

## 5. Roadmap par phases (checklist détaillée)

Les phases ci-dessous sont alignées avec la vision “Proton Mail + Pass + Gmail + Drive” et le plan d’implémentation détaillé. **Cocher au fur et à mesure** pour suivre l’avancement.

### Phase 0 — Infra commune

- [ ] Repo / dossier `cloudity-infra` ou structure claire : docker-compose global (Nginx reverse, Postgres, Redis).
- [x] Fichiers `postgresql.conf` et `redis.conf` : mounts retirés du Compose (config par défaut) → démarrage sans erreur.
- [x] Init PostgreSQL fiable : scripts dans `infrastructure/postgresql/init/` (ex. `01-schema.sql`).
- [ ] Templates ou structure type pour nouveaux services (Go backend, Flutter front).
- [ ] Migrations DB versionnées (création du mécanisme + première migration si besoin).

### Phase 1 — Auth + Password Manager MVP

- [ ] **Auth Cloudity** : login/register réels, Argon2id, JWT + refresh tokens (rotation), 2FA TOTP.
- [ ] **Password Manager backend** (Go ou Rust) : CRUD vaults/items, auth, stockage blobs chiffrés côté client (serveur ne voit que ciphertext).
- [ ] **DB** : schéma `pass` (vaults, collections, métadonnées).
- [ ] **Front Flutter** : Web + Desktop Linux (liste, CRUD mots de passe, déchiffrement côté client).
- [ ] **Extension navigateur** (Brave/Chrome) : lecture/ajout d’entrées, auto-fill simple.

### Phase 2 — Mail Core + Client

- [ ] **Stack mail** : Postfix + Dovecot + Rspamd + Redis + PostgreSQL (Docker Compose).
- [ ] **mail-directory-service** (Go) : domaines, comptes, alias (CRUD + API).
- [ ] **Schéma DB mail** : domains, mailboxes, aliases, politiques.
- [ ] **UI admin** (web) : gestion comptes/alias mail.
- [ ] **mail-client-api** : expose IMAP/SMTP en REST/GraphQL pour le client.
- [ ] **Client mail Flutter** : Web + Linux (lecture/envoi, dossiers, étiquettes, règles simples type Sieve).

### Phase 3 — Intégration alias + Password Manager

- [ ] **API alias** unifiée dans mail-directory-service (création alias temporaire/permanent, expiration).
- [ ] **Extension Pass** : bouton “Créer alias” → appel API → remplissage champ email + stockage dans vault.
- [ ] **UI Cloudity** : vue centralisée alias, règles de forwarding, expiration.

### Phase 4 — E2E mail + Drive

- [ ] **Mail E2E** : chiffrement OpenPGP pour mails Cloudity–Cloudity (gestion clés, import/export).
- [ ] **Drive** : service stockage (fichiers chiffrés côté client, meta en DB, stockage objet ou FS).
- [ ] **Client Drive** : Flutter (web/desktop/mobile) + intégration avec le reste de la suite.

### Phase 5 — Mobile et finalisation

- [ ] **Apps mobiles** : Mail et Password Manager (Flutter) pour Android/iOS.
- [ ] **Sync** : cohérence multi-app (vault, mail, drive).
- [ ] **Sécurité** : audit logs, backups chiffrés (ex. restic/borg), tests de restauration.
- [ ] **Prod** : Nginx Proxy Manager (ou Nginx/Traefik), TLS 1.3, HSTS, headers sécurité, rate limiting.

---

## 6. Migrations et nettoyage à faire

- [x] **Init PostgreSQL** : le schéma initial est dans `infrastructure/postgresql/init/01-schema.sql` ; le Compose monte ce dossier.
- [x] **Ports 60XX** : tous les services exposés en 60XX (6042, 6079, 6081, 6000, 6082, 6001, 6083, 6084) ; `VITE_API_URL` et CORS mis à jour.
- [ ] **Alignement schéma auth** : `users.tenant_id` (INTEGER vs UUID), retour de `uuid` vs `id` selon les services (auth-service utilise `id` dans l’INSERT).
- [ ] **Migrations DB versionnées** : mettre en place un mécanisme (golang-migrate, Flyway, ou `infrastructure/postgresql/migrations/*.sql`) pour les évolutions de schéma (mail, pass, drive).
- [ ] **Branches** : travailler depuis `main` ; merger `develop` / `feature/*` une fois validé.
- [ ] **Documentation** : garder `PlanImplementation.md` pour la vision long terme ; **STATUS.md** = référence quotidienne de suivi.

---

## 7. Références croisées

- **Vision détaillée** : décrite dans la demande (Mail Core, Mail App, Password Manager, Core Cloudity, stack, roadmap).
- **Plan global** : `PlanImplementation.md` (phases 1–6, métriques, ressources).
- **Architecture technique** : `README.md` (schémas, exemples de code, stack cible).
- **Docker** : `docker-compose.yml` (dev complet), `docker-compose.services.yml` (services seuls).

---

*Ce fichier sert de **référence unique** pour l’avancement du projet CLOUDITY. Mettre à jour les cases et la date à chaque avancée significative.*
