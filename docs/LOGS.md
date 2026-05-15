# Journal cumulatif des actions (assistant & dépôt)

**Rôle** : consigner **chaque tour de travail** demandé dans le dépôt (code, doc, infra), en **résumé vérifiable**, pour retrouver *qui a fait quoi* et quand.  
**Exception** : si le message commence par **`NPNLD`**, ne pas ajouter d’entrée pour ce tour (voir **[INSTRUCTIONS-IA.md](INSTRUCTIONS-IA.md)**).

**Format d’une entrée** (à recopier) :

```text
### YYYY-MM-DD — <sujet court>
- Branche : …
- Fichiers / zones : …
- Commandes / checks : …
- Liens doc : …
```

---

### 2026-05-15 — Auth E2E bootstrap, PDF Drive, ports `.env`, doc Git & Makefile

- Branche : `feat/photos-gallery-mobile-sync-security` (alignée avec chantier en cours sur le dépôt).
- **Backend** : `auth-service` — endpoints `POST /auth/e2e/bootstrap-mint` + `exchange` (TEST-AUTH-01), Redis OTP `GetDel`, garde-fous prod ; tests Go ; `api-gateway` chemins `/auth/e2e/*` + rate-limit.
- **Frontend** : aperçu PDF Drive via **PDF.js** (`DrivePdfJsPreview`, `pdfjs-dist`) pour éviter la barre Chrome/Google sur `<embed>` ; `vite.config.js` `optimizeDeps`.
- **Infra** : `docker-compose.yml` — ports hôte paramétrables (`PORT_GATEWAY`, `PORT_DASHBOARD`, …) avec défauts identiques à l’existant ; `Makefile` — `PORT_*` en `?=`, cibles `up-lean`, messages Adminer/Redis Commander explicites.
- **Doc** : création `docs/GIT.md`, `docs/INSTRUCTIONS-IA.md`, `docs/LOGS.md`, `docs/operations/PORTS-HOTES.md` ; ajustements `.env.example`, `STATUS` / `TODOS` / `docs/README` / `BRANCHES` / `DEV-VERIFICATION` / `DEVELOPMENT-HOST` ; rappels flux **Make** plutôt que npm manuel.
- **Checks** : à exécuter côté poste : `make test` / `make test-dashboard` après `make dashboard-npm-install` si besoin.

---

### 2026-05-15 — Doc flux Make, TODOS / DEV-VERIFICATION / DEVELOPMENT-HOST, BACKLOG, `.env.example` ports

- Branche : `feat/photos-gallery-mobile-sync-security`.
- **Doc** : **[TODOS.md](../TODOS.md)** — renvoi **INSTRUCTIONS-IA** + **LOGS** ; **[DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md)** — lien INSTRUCTIONS-IA en tête, §1 privilégie `make test-dashboard` / `make up-lean` ; **[DEVELOPMENT-HOST.md](operations/DEVELOPMENT-HOST.md)** — §0 Make + ports + `up-lean` ; **[BACKLOG.md](../BACKLOG.md)** — convention Git/agent ; **[.env.example](../.env.example)** — bloc commenté `PORT_*` aligné sur `docker-compose.yml` ; **[docs/README.md](README.md)** — liens `GIT.md` corrigés (même dossier `docs/`).
- **Checks** : `go test ./...` dans **`backend/auth-service`** ✅ (~2,6 s).

---

### 2026-05-15 — VPS / NPM / réseaux Docker : § 4 bis déploiement + renvoi JobbingTrack

- Branche : travail doc sur dépôt Cloudity (fichier modifié non commité par ce tour si l’utilisateur ne demande pas de commit).
- **Doc** : **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** — ajout **§ 4 bis** (héritage multi-ponts, DNS inter-bridges, hosts NPM orphelins, inventaire hors Git) ; **[docs/README.md](README.md)** — ligne index mise à jour.
- **Vérif** : lecture parallèle **JobbingTrack** `docs/deployment/VPS_PORTAINER_NPM_OVH.md` § 2.1 ; `gh api` branches JobbingTrack indisponible sur l’environnement (`exit 127`).

---

### 2026-05-15 — Q23 prod : `cloudity.<DOMAIN>` shell SPA, DNS+NPM, healthchecks, TODOS/STATUS

- **Doc** : **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** — § 1 (pattern, healthchecks internes vs URLs publiques), **§ 1 bis** DNS registrar + NPM, **§ 1 ter** chemins `/app/…` vs sous-domaines ; § 2 schéma ; § 3 table ; § 8 + **§ 8 bis** ; CORS / smoke / § 11 ; pied de page.
- **Décisions** : **[REPONSES.md](decisions/multi-repo/REPONSES.md)** (Q23), **[QUESTIONNAIRE.md](decisions/multi-repo/QUESTIONNAIRE.md)** (Q23 A — lien déploiement).
- **Script** : **`scripts/ops/smoke-prod.sh`** — défaut `SMOKE_APP_URL` = `https://cloudity.example.org`.
- **Suivi** : **[TODOS.md](../TODOS.md)** § « Prod VPS », **[STATUS.md](../STATUS.md)** en-tête.

---

*Créé : 2026-05-15.*
