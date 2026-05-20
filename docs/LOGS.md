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

### 2026-05-20 — Mail : recherche partielle + bouton effacer

- Branche : `feat/cloudity-ui-design-system`.
- **Frontend** : **`MailPage.tsx`** — le bouton **Effacer la recherche** est maintenant ancré dans le champ, plus au-dessus du bouton **Nouveau**.
- **Backend** : **`mail-directory-service`** — la recherche `q=` garde le FTS FR/EN mais ajoute un fallback `LIKE` sur sujet / expéditeur / destinataires / corps, pour trouver des termes partiels comme `Actu` → `Actualités`.
- **Tests** : **`MailPage.test.tsx`** — recherche partielle + position du bouton ; **`main_test.go`** — SQL FTS + fallback partiel + tri pertinence.
- **Checks** : `make test-dashboard-one FILE=src/pages/app/mail/MailPage.test.tsx` ✅ (24 tests) ; `make test-go-one SERVICE=mail-directory-service` ✅ ; `make deploy-mail` ✅.

---

### 2026-05-20 — Mail : test Vitest « Recharger le message »

- Branche : `feat/cloudity-ui-design-system`.
- **Tests** : **`MailPage.test.tsx`** — scénario corps vide puis refetch HTML (type impôts.gouv) ; mock **`markMailMessageRead`** en **`beforeEach`**.
- **Commit** : `b4b1325f` — conversations Mail + Pass alias + U5.
- **Checks** : `make test-dashboard-one FILE=src/pages/app/mail/MailPage.test.tsx` ✅ (23 tests).

---

### 2026-05-20 — UI-DS U5 : tests dashboard verts

- Branche : `feat/cloudity-ui-design-system`.
- **Front** : **`MailPage.tsx`** — le bouton chrome **Conversations** reçoit maintenant `conversationMode` et `onToggleConversations`, ce qui réactive le regroupement par `thread_key`.
- **Tests** : **`PassMailAliasesPanel.test.tsx`** — mocks alias complétés (`fetchMailAliasConfig`, `patchMailAlias`) et sélecteur “Boîte” rendu exact pour éviter l’ambiguïté avec “Boîte de réception”.
- **Suivi** : **[TODOS.md](../TODOS.md)** — `U5` coché ; **[STATUS.md](../STATUS.md)** — en-tête mis à jour.
- **Mail** : `make test-go-one SERVICE=mail-directory-service` ✅, dont **`TestParseRFC822Mail_HTMLAsAttachmentDisposition`** ; `make deploy-mail` ✅. La validation du vrai message IMAP reste manuelle (`Recharger le message`).
- **Checks** : `make test-dashboard-one FILE=src/pages/app/pass/PassMailAliasesPanel.test.tsx` ✅ ; `make test-dashboard-one FILE=src/pages/app/mail/MailPage.test.tsx` ✅ ; `make test-dashboard` ✅ (37 fichiers, 294 tests passés, 3 ignorés).

---

### 2026-05-16 — make status : bloc URLs (LAN + ports .env)

- **Script** : **`scripts/dev/status.sh`** — après le tableau conteneurs : hub, login, register, Pass, Mail, Drive, `/4dm1n`, gateway `/health`, `/auth/health`, rappel **PLAYWRIGHT_API_URL**, Adminer, Redis Commander, Postgres/Redis ; variables **`CLOUDITY_STATUS_HOST`**, **`CLOUDITY_STATUS_PROTO`**.
- **Doc** : **[STATUS.md](../STATUS.md)** §0 (URLs + ligne tableau *Avant chaque reprise*) ; **[PORTS-HOTES.md](operations/PORTS-HOTES.md)** ; **Makefile** `help` + cible **`status`**.
- **Checks** : `./scripts/dev/status.sh` ; `CLOUDITY_STATUS_HOST=192.168.1.99` ; **`make test`** ✅ (~2,5 min).

---

- **Backend** : **`passwords-service`** — `DELETE /pass/vaults/:id` (RLS utilisateur).
- **Front** : **`api.ts`** `deleteVault` ; **`PassPage.tsx`** bouton supprimer coffre ; **`UnlockScreen`** rappel maître vs compte.
- **E2E** : **`e2e/fixtures/pass-cleanup.ts`** + **`pass.spec.ts`** `afterEach` ; **`playwright.config.ts`** commentaire **`PLAYWRIGHT_API_URL`**.
- **Doc** : **`PASS-CRYPTO.md`** § 1.1 ; **`TESTS.md`** § 3.5 (résidus + test manuel alias sans domaine personnel).

---

- **Script** : **`scripts/dev/cleanup-pass-e2e-vaults.sh`** ; **Makefile** : **`clean-pass-e2e-vaults`** + **`.PHONY`** + **`make help`**.
- **E2E** : commentaire **`e2e/pass.spec.ts`** (plus de « nettoyage » item seul — coffres résiduels).
- **Doc** : **[STATUS.md](../STATUS.md)** §0 (tableau + cartographie dev/prod) ; **[DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md)** §0 ; **[TESTS.md](operations/TESTS.md)** §3.5 ; **[TODOS.md](../TODOS.md)** § Dev ; **[BACKLOG.md](../BACKLOG.md)** (hygiène Playwright).
- **Code** : aucun changement backend.

---

- **Front** : **`PassMailAliasesPanel.tsx`** + intégration **`PassPage.tsx`** (après grille coffres / entrées) ; **`PassMailAliasesPanel.test.tsx`** (Vitest).
- **Doc** : **[BACKLOG.md](../BACKLOG.md)** PASS-ALIAS-UI coché ; **[SYNC-BACKLOG.md](produit/SYNC-BACKLOG.md)** § 2 + checklist *Pass / alias*.
- **Checks** : `make test-dashboard-one FILE=src/pages/app/pass/PassMailAliasesPanel.test.tsx` ✅.

---

- **Doc** : **[RELEASE-AND-DISTRIBUTION.md](operations/RELEASE-AND-DISTRIBUTION.md)** — § 7 (tableau A–**F**) ; § 8 sans liste dupliquée (suivi = **BACKLOG**) ; **[TODOS.md](../TODOS.md)** — § Prod VPS : paragraphe complet restauré + lien RELEASE ; **[LOGS.md](LOGS.md)** — entrées orphelines regroupées sous *Feuille de route Mail + alias*.
- **Code** : aucun.

---

### 2026-05-16 — RELEASE-AND-DISTRIBUTION : prod partielle, OTA Android, Pass/alias

- **Doc** : nouveau **[RELEASE-AND-DISTRIBUTION.md](operations/RELEASE-AND-DISTRIBUTION.md)** ; **[docs/README.md](README.md)** ; **[STATUS.md](../STATUS.md)** phase **F** ; **[BACKLOG.md](../BACKLOG.md)** — REL-01..03, PASS-ALIAS-UI, PASS-AUTOFILL-ANDROID ; **[TODOS.md](../TODOS.md)** § Prod VPS.
- **Code** : aucun.

---

### 2026-05-16 — Feuille de route : phase Mail + alias (SYNC-BACKLOG § 2)

- **Doc** : **[STATUS.md](../STATUS.md)** — ligne phase **C** (domaines, boîtes, **alias**, routes admin `/mail/aliases*`, AS-1, SYNC-BACKLOG § 0e / § 2) ; paragraphe **Mobile Mail** ; en-tête ; restauration titre **§ Rituel après session** (partie B).
- **Doc** : **[STATUS.md](../STATUS.md)** — § *À faire maintenant* : tableau phases A–E (Pass → qualité → Mail AS-1 → Drive/Photos → prod) ; rappel mobile Mail MVP + **ROADMAP APP-01** ; **[TODOS.md](../TODOS.md)** § Prod VPS — renvoi vers ce tableau.
- **Code** : aucun.

---

### 2026-05-16 — STATUS « À faire maintenant » : rituel A/B + INSTRUCTIONS-IA

- **Doc** : **[STATUS.md](../STATUS.md)** — § *À faire maintenant* restructuré (partie A avant session, priorités J8 / URL+E2E / post-J8, partie B après session, bloc hors Portainer + Q15) ; **[INSTRUCTIONS-IA.md](INSTRUCTIONS-IA.md)** — lien explicite vers STATUS § À faire ; date pied de page.
- **Code** : aucun.

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
