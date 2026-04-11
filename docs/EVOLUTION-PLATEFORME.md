# Évolution de la plateforme Cloudity

Document court pour **faire grandir** le projet (API, services, web, mobile) sans tout casser.

## Structure actuelle (mono-dépôt)

| Zone | Rôle |
|------|------|
| `backend/api-gateway` | Point d’entrée HTTP unique (ports exposés côté client), routage vers les microservices. |
| `backend/*-service` | Un service = un domaine (auth, drive, mail, pass, …). Base Postgres partagée, schémas isolés par migrations. |
| `frontend/admin-dashboard` | SPA React ; appelle le **gateway** (`VITE_API_URL`), pas les services en direct. |
| `infrastructure/postgresql/migrations` | Scripts SQL versionnés ; appliqués par le conteneur `db-migrate` au `docker compose up`. |

**Mobile / autre client** : même contrat que le dashboard — **JWT** + appels HTTPS vers le gateway (ou une variante `api.mobile.*` plus tard). Pas besoin de dupliquer la logique métier : tout reste côté services.

## Ajouter un microservice (checklist)

1. **Code** : `backend/nom-service` (Go ou autre), `GET /health` sur le port interne fixe.
2. **Migrations** : nouveau fichier `infrastructure/postgresql/migrations/NN-description.sql` (préfixe numérique pour l’ordre).
3. **Compose** : service dans `docker-compose.yml` + `depends_on` postgres + `db-migrate` + **healthcheck** avec `start_period` suffisant si le binaire démarre lentement (`go run` en dev).
4. **Gateway** : reverse proxy vers `http://nom-service:PORT` + en-têtes déjà utilisés (`Authorization`, `X-User-ID`, …).
5. **Frontend** : fonctions dans `api.ts` + pages sous `src/pages/app/`.

## Évolutivité technique

- **Contrats API** : préférer des JSON stables ; versionner l’URL seulement si rupture (`/v2/...`).
- **Feature flags** : peuvent vivre en base ou config service ; le gateway peut router conditionnellement.
- **Cache / files** : Redis déjà présent pour sessions ; extensions possibles (queues, rate limit).
- **Séparation prod** : `docker-compose.prod.yml` pour images non-`go run`, secrets injectés (pas de mots de passe en clair dans l’image).

## Si `make up-full` échoue (healthchecks)

1. `make debug-logs` — en tête : **password-manager** et **drive-service**.
2. Vérifier `.env` : `POSTGRES_PASSWORD` sans caractères non encodés dans une URL si vous construisez `DATABASE_URL` à la main (`@`, `#`, `:` → encodage ou guillemets).
3. Après changement de Dockerfile : `docker compose build --no-cache drive-service password-manager` puis `make up`.
4. Premier démarrage : les services Go en mode `go run` peuvent prendre **1–3 minutes** ; les healthchecks ont une **période de grâce** (`start_period`) pour éviter les faux « unhealthy ».

## Prochaines briques possibles

- SDK OpenAPI généré depuis le gateway.
- Application mobile (Flutter déjà mentionné dans le Makefile `init`) consommant les mêmes routes.
- Observabilité : OpenTelemetry sur le gateway puis propagation vers les services.

Ce fichier peut être complété au fil des décisions d’architecture (ADR courts en bas de page si besoin).

---

## Récemment ajouté ou en cours (résumé produit)

| Domaine | Livré côté repo | Suite logique (sécurité / produit) |
|--------|------------------|-------------------------------------|
| **Calendrier** | Table `user_calendars`, `calendar_id` sur `calendar_events`, API `GET/POST /calendar/calendars`, filtre `?calendar_id=` sur les événements ; UI mois + liste + création d’agendas colorés (`CalendarPage`). | Vues semaine / jour avec glisser-déposer, invitations (lien Contacts), pièces jointes Drive, synchro CalDAV. |
| **Contacts** | UI deux colonnes, recherche, initiales, lien « Envoyer un mail » (`/app/mail?compose=…`). | Groupes / libellés, fusion doublons, synchro CardDAV. |
| **Mail** | Alias par boîte (`user_email_aliases` + API), filtre liste via `?recipient=`, score anti-spam heuristique (`spam_score`), lien Coffre Pass et rappel chiffrement MDP IMAP. | Règles Sieve-like, ML ou fournisseur spam, chiffrement des corps au repos + clés utilisateur (envelope encryption), WebPush nouveaux messages. |
| **Sécurité** | Mots de passe comptes mail déjà chiffrés en base (clé env) ; JWT + gateway. | Audit menace, KMS, rotation clés, S/MIME optionnel, masquage expéditeur (anti-spoof UI). |

Les migrations **`15-calendar-user-calendars.sql`** et **`16-mail-user-aliases.sql`** s’appliquent au prochain `docker compose up` (service `db-migrate`).
