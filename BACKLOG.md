# CLOUDITY — Backlog produit & technique

**Rôle** : liste **actionnable** des prochaines livraisons et dettes connues. **Suivi court** (correctifs doc, mini-tâches) : **[TODOS.md](./TODOS.md)**. Pour le détail sync / mobile / session / archivage mail, voir **[docs/produit/SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)**. Pour les fiches par application (**APP-01** … **TR-07**), voir **[docs/produit/ROADMAP.md](docs/produit/ROADMAP.md)**. **Sécurité & confiance (vision, phases, Zero Trust, signatures, WAF)** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)**. **Suivi quotidien** : **[STATUS.md](./STATUS.md)**. **Tests** : **[docs/operations/TESTS.md](docs/operations/TESTS.md)**.

**Vision suite (ordre stratégique + décisions produit)** — ne remplace pas ce fichier : **[docs/produit/VISION-SUITE.md](docs/produit/VISION-SUITE.md)** (couches P0–P7, phases A–F, lien avec **PERFORMANCES.md** et l’état réel Mail / Photos / Pass).

**Convention** : cocher ici ou dans **TESTS.md** §4 quand une ligne est livrée ; garder **STATUS.md** à jour (**une** ligne *Dernière mise à jour* + section *À faire maintenant* ; le journal long va dans **[docs/operations/STATUS-JOURNAL-ARCHIVE.md](docs/operations/STATUS-JOURNAL-ARCHIVE.md)**). **Git / agent** : **[docs/GIT.md](docs/GIT.md)** + **[docs/INSTRUCTIONS-IA.md](docs/INSTRUCTIONS-IA.md)** + **[docs/LOGS.md](docs/LOGS.md)** (sauf `NPNLD` en tête de message).

**Hygiène données locales (Pass / Playwright)** : les specs **`e2e/pass.spec.ts`** créent des coffres **`e2e-*`** en Postgres ; nettoyage sans API « delete vault » : **`make clean-pass-e2e-vaults`** — **STATUS** §0, **TESTS** §3.5.

---

## Sprint d’urgence Pass — **deadline ~2026-05-20** (migration Proton Pass)

**Contexte** : fin d’abonnement payant Proton (~25 mai 2026) — cible interne **20 mai** pour un **MVP Pass utilisable** (web + crypto client + import + TOTP item + 2FA compte Cloudity). **Extension navigateur** et **mobile Flutter Pass** viennent **après** le socle web si le calendrier serre.

**Décision 2026-05-13** : **gel de la scission multi-repo GitHub** — le monorepo reste la source de vérité jusqu’à fin du sprint (pas de extraction de dépôts ni de submodules tant que L1 Pass n’est pas vert).

**Fiche détaillée** (état des lieux, L1/L2/L3, jalons jour par jour, critères d’acceptation) : **[docs/produit/SPRINT-PASS-2026-05.md](docs/produit/SPRINT-PASS-2026-05.md)**.

### L1 — bloquant avant migration

- [x] **J1 — `frontend/packages/pass-crypto` v0.1.0** : workspace npm bootstrap, types `EnvelopeV1`, primitives Argon2id (`hash-wasm`) / XChaCha20-Poly1305 (`@noble/ciphers`) / HKDF-SHA-256 (`@noble/hashes`) / CBOR (`cbor-x`) / base64url maison ; helpers `deriveMasterKey`, `deriveVaultKey`, `encryptItemForVault`, `decryptItemFromVault`, `generatePassword`. **18 tests Vitest verts** (round-trip multi-paramètres + anti-tampering `ct`/`wrap`/`aad`/`nonce_c` + base64url fuzz + générateur uniforme), `tsc --noEmit` OK. Dépendance ajoutée à `cloudity-web`.
- [x] **J2 — vecteurs reproductibles + bench Argon2id** : `vectors.test.ts` fige bit-à-bit Argon2id MK + HKDF VK + `EnvelopeV1` complet (CBOR + base64url) avec RNG xorshift32 seed `0xdeadc0de` ; `scripts/bench-argon2.mjs` (warmup + médiane sur N itérations sur 4 profils) cible `npm run bench:argon2 -w @cloudity/pass-crypto`. Mesures laptop dev : desktop 924 ms (-8 %), mobile-high 378 ms, mobile-low 165 ms — pas de réajustement nécessaire (les vrais devices mobiles seront plus lents que le laptop). pass-crypto à **22/22 verts**.
- [x] **J3 — Pass web (UI complète)** : `vaultContext` (master key 32 oct **uniquement** en mémoire React, jamais persistée ; auto-lock 5 min d'inactivité ; zeroïsation `.fill(0)` au lock + démontage ; salt utilisateur dérivé déterministe SHA-256 du préfixe + `user_id`), `UnlockScreen` (saisie maître + dérivation Argon2id côté client + loader), `ItemEditor` (form login + toggle visibilité + générateur intégré + copie auto-clear + suppression), `clipboardAutoClear` (TTL 30 s, n'écrase pas un copier-coller ultérieur via `navigator.clipboard.readText()`, fallback overwrite blind si permission refusée), `PassPage` 2 colonnes (vaults / items) + recherche locale (titre/URL/utilisateur/notes) + déchiffrement local de chaque ciphertext. `api.ts` complété (`createVaultItem` / `updateVaultItem` / `deleteVaultItem`). **254/3 tests cloudity-web verts** (29 fichiers, ~12 s) — 11 nouveaux : `PassPage.test.tsx` (3), `vaultContext.test.tsx` (3, avec `vi.useFakeTimers` pour valider l'auto-lock sans 5 min réelles), `clipboardAutoClear.test.ts` (5). ESLint clean. E2E Playwright couverts en **J4** (`e2e/pass.spec.ts`).
- [x] **J4 — Import Proton JSON + TOTP + e2e** : `protonImport.ts` + tests (8) ; `totp.ts` + `TotpDisplay.tsx` + tests RFC 6238 (16) ; `ProtonImportDialog.tsx` ; `PassPage` import concurrence 4 ; `e2e/pass.spec.ts` (déverrouillage, CRUD 1 entrée, verrouillage, import 3 entrées dont 1 avec `totpUri`). **278/3 tests Vitest verts** (31 fichiers). E2E : `PLAYWRIGHT_E2E_MASTER` optionnel (défaut = mot de passe démo).
- [x] J5 — **2FA compte Cloudity backend + Passkeys W2 backend** : migration **38** `recovery_codes` (bcrypt cost 12, FK CASCADE, index partiel `WHERE used_at IS NULL`). Module Go `recovery_codes.go` : génération `XXXX-XXXX-XXXX` 12 chars alphabet sans `0/O/1/I/L` (~59 bits), `Verify2FA` accepte TOTP **OU** code récup, génération automatique de 10 codes à la 1ère activation, endpoint `POST /auth/2fa/recovery-codes/regenerate` + `GET /count`, **timing-constant** sur `bcrypt.CompareHashAndPassword`, anti-race via UPDATE conditionnel `used_at IS NULL`. Passkeys : `loadAdminUser` → `loadUser` (ouvert tout user actif), `requireAdminUser` → `requireAuthUser` retournant `(uid, role)`, helpers `passkeyRegistrationOptions` (**`residentKey: required` + `userVerification: preferred` + `Attestation: none`**) + `passkeyLoginOptions`, **quota 5/user**, endpoints `POST /auth/webauthn/login/begin-discoverable` + `/finish-discoverable` (`BeginDiscoverableLogin` go-webauthn + `userHandle → uid` via `userIDFromWebAuthnID`). Tests Go : 5 sur recovery_codes, 4 sur webauthn_user (admin+user, missing bearer, default role, round-trip handle). Bug `replace ../internalsec` corrigé via volume bind `./backend/internalsec:/internalsec:cached` dans `docker-compose.yml`. **Tests auth-service ✅ 2.0 s**.
- [x] J6 — **Login 2FA étape 2 + Settings codes de récupération + Passkeys user + Conditional UI** : `LoginPage` refacto avec étape 2FA (TOTP 6 chiffres OU code récup `XXXX-XXXX-XXXX` ; toast spécifique « connexion via code récup — pense à régénérer »). `loginWithPasskeyDiscoverable` (vérifie `isConditionalMediationAvailable`, `mediation: 'conditional'`, AbortController). `autoComplete="username webauthn"` + `current-password webauthn` → la **Conditional UI** propose la passkey enregistrée dans Proton Pass / iCloud Keychain / Bitwarden directement au focus du champ email. `useEffect` autonome au mount (silencieux si pas dispo). `api.ts` : helpers `enable2FA`, `verify2FA`, `regenerateRecoveryCodes`, `countRecoveryCodes`. **Settings utilisateur** : `pages/app/settings/PasskeysSection.tsx` (compteur **X / 5**, désactive le bouton à 5) + `RecoveryCodesSection.tsx` (compteur live, warning ≤2, régénération avec confirmation, affichage UNE fois en grid 2 col `select-all`, **« Tout copier » + « Imprimer »** popup, bouton « masquer » manuel) + `AppSettingsPage.tsx` (3 sections : Session / Passkeys / 2FA). E2E adaptés : fixture login (2 boutons « Se connecter » exact + « passkey »), `pass.spec.ts` ciblage `getByRole('textbox')` (libellés URL/Utilisateur partagés avec boutons), `webauthn.spec.ts` tolère la Conditional UI qui authentifie avant le clic manuel. **Tests Vitest 278/278 ✅ — Playwright 6/6 ✅** (4 Pass + 2 WebAuthn).
- [x] J7 bis — **URL capabilities rotatives (durcissement 2FA / settings)** : (Backend Go) `securetoken_hmac.go` / `securetoken_http.go` — HMAC-SHA-256 sur `(user_id, purpose, epoch 30 j)`, troncature 128 bits, sliding window (epoch courant + précédent), whitelist purposes, secret = `URL_TOKEN_SECRET ≥ 32 oct` ou dérivation `SHA-256("cloudity-url-tokens-v1:" || JWT_SECRET)`. Endpoints `GET /auth/security-paths` + `POST /auth/security-paths/validate` (Bearer obligatoire, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`). 9 tests Go verts. (Frontend) `useSecurePaths` (React Query, slug jamais persisté), `SettingsRedirect` canonique → rotatif, `SecureSettingsPage` (validation + injection `<meta name="referrer" content="no-referrer">`). 5 tests Vitest verts. (Migration) `39-pass-share-tokens.sql` (token aléatoire 192 bits hashé SHA-256, révocable, `expires_at` optionnel, `use_count`) — squelette infra pour partage Pass stable (UI + endpoints en L2/L3). (Doc) `docs/securite/URL-CAPABILITIES.md` + lien dans `SECURITE.md` § 8.
- [x] J7 ter — **Parité 2FA mobile (Drive / Mail / Photos)** : `mobile/cloudity_shared/lib/auth_2fa.dart` (175 l) — `LoginRequires2FAException(email, tenantId, userId?)` (mot de passe **non conservé**), client `Auth2FAClient.verify({email, tenantId, code})` → `Auth2FAResult` (TOTP **ou** recovery 12 chars détecté serveur), helper `looksLikeRecoveryCode` aligné serveur. **11 tests `dart test` verts**. Chaque app `mobile/{drive,mail,photos}` : `auth_api.dart` convertit `requires_2fa: true` → exception métier (au lieu du blocage *« utilisez le web »*) + nouvelle méthode `verify2FA`, `login_screen.dart` ajoute un état `_twoFactorRequired` qui bascule sur `_build2FAForm` (champ unique TOTP/recovery, bouton « Annuler / changer de compte »). Mail garde son scan multi-gateway (l'exception 2FA est attrapée dans la boucle). Mot de passe effacé du contrôleur dès la bascule. `flutter analyze` **0 issue** sur les 4 packages, `flutter test` ✅ Drive/Mail/Photos. Pass mobile non concerné (pas de login direct), `admin_app` non concerné (squelette PoC). (Doc) `docs/securite/URL-CAPABILITIES.md` § 7 « Couverture mobile (apps Dart) — parité 2FA ».

#### URL-CAPABILITIES — correctifs doc & UX (post J7 bis)

> **Doc** : **[docs/securite/URL-CAPABILITIES.md](docs/securite/URL-CAPABILITIES.md)** (§ 2.2 sliding window, § 2.4 pas de reconnexion, périmètre Bearer). Suivi court : **[TODOS.md](./TODOS.md)** § URL-CAPABILITIES.

- [x] **UC-DOC-01 — § 2.2 sliding window** : préciser que la rotation protège surtout les **fuites passives** à long terme (historique, screenshot, bookmark) ; qu’un **attaquant actif** avec slug + **JWT valide** exploite **tout de suite** ; qu’un **slug seul** ne suffit jamais — défense active = durée du access token + rate-limit sur `/auth/security-paths/validate` (aligné threat model § 1).
- [x] **UC-FE-01 — Re-fetch proactif `useSecurePaths`** : `invalidateQueries` planifié à `rotates_at - 5 min` via `useEffect` (`frontend/.../useSecurePaths.ts`, 2026-05-16).
- [x] **UC-QA-01 — Confirmer périmètre Bearer** : garde-fou Vitest `src/security/ucQa01SlugIsolation.test.ts` (`api.ts` sans slug `/app/settings/sec/` ni `useSecurePaths`) ; E2E/manuel au besoin.

- [x] J7 — **`mobile/pass` Flutter LECTURE SEULE** : squelette `mobile/pass/` (Android + Linux desktop, `cloudity_pass` v0.1.0). Port Dart `lib/pass_crypto.dart` strictement interopérable web : Argon2id (`cryptography` ^2.7.0, profils `mobileLow`/`mobileHigh`/`desktop` alignés sur `ARGON2ID_PROFILES` web), HKDF-SHA-256 (salt 32×0x00, label `cloudity-pass/v1/vault-key:` + vault_id), XChaCha20-Poly1305 (split tag 16 oct ↔ format `noble-ciphers` web), CBOR (`cbor` ^6.3.1) → décodage `EnvelopeV1` v=1 complet (déchiffre `wrap`+VK pour récupérer `IK_item`, puis `ct`+`IK_item`, plaintext = CBOR `{schema, type, fields, notes, tags}`). Préfixe salt utilisateur `cloudity-pass:v1:user-salt:` aligné sur `vaultContext.tsx`. **5 écrans** : `PassLoginScreen` (gateway/email/password/tenant) → `PassUnlockScreen` (mot de passe maître + sélecteur de profil Argon2id) → `PassVaultsScreen` → `PassItemsScreen` (recherche + déchiffrement par item, icône par type) → `PassItemDetailScreen` (champs masquables, copie auto-clear 30 s). `VaultController` central : MK uniquement en mémoire Dart, `WidgetsBindingObserver` re-verrouille à chaque pause/inactive/detached, auto-lock 5 min, `zeroize` au lock + dispose. `PassSessionStore` distinct (clés `cloudity_pass_*`). **Tests 21/21 verts** : 16 unitaires pass-crypto Dart + **5 cross-stack web→mobile** (`cross_stack_vector_test.dart`) qui rejouent le vecteur figé `frontend/packages/pass-crypto/src/__tests__/vectors.test.ts` — MK hex bit-à-bit identique (`46d34f0b75afe0…`), VK hex bit-à-bit identique (`bef6308f2247fa…`), déchiffrement de l'enveloppe figée → plaintext `{title:'Vector test', …}` exact. Garantie d'interop : si une dépendance Dart change sa sortie ces tests cassent **avant** que les coffres deviennent illisibles. `flutter analyze` 0 issue. Édition mobile reste en L2.

### L2 — après le 20 mai (J+1..J+5)

- [ ] **`mobile/pass` Flutter ÉDITION** : création / modif / suppression d’items, générateur, sync optimiste, gestion conflits.
- [x] **Extension navigateur Pass — squelette MV3 livré (J7 ter, 2026-05-13)** : `extensions/cloudity-pass/` (manifest MV3, popup, background service worker avec auto-lock 5 min via `chrome.alarms`, content script avec badge passif, page options pour gateway URL, build esbuild). `npm run build` ✅, `tsc --noEmit` ✅. **L'autofill réel et l'intégration `@cloudity/pass-crypto` arrivent en MP-06** (cf. `docs/produit/MULTI-PLATEFORME.md`).
- [x] **MP-06 — Extension navigateur Pass autofill réel (initial)** : `@cloudity/pass-crypto` branché dans le service worker (MK en RAM, auto-lock conservé), appels `/pass/vaults` + `/pass/vaults/:id/items`, déchiffrement `EnvelopeV1`, filtrage strict par domaine (`hostMatchesEntry`), menu content-script sur badge Cloudity et remplissage username/password uniquement après clic utilisateur. `make test-pass-extension` ✅.
- [x] **Pass L3 (partiel) — Popup extension avancée** : liste des entrées login pour le domaine de l’onglet actif (filtre, copie identifiant/mot de passe, « Remplir l’onglet » via `fill-active-tab` + message content `fill-login`). Permission `tabs`. Reste L3 : icônes PNG, hardening Firefox/Safari (**MP-08**).
- [x] **MP-07 — Tests Playwright extension** : Chromium headless avec `--load-extension=extensions/cloudity-pass/dist` via `make test-e2e-playwright-pass-extension` ; crée une entrée Pass via l’UI web, charge l’extension MV3, déverrouille le service worker, liste un candidat par domaine et vérifie l’autofill username/password après clic utilisateur. CORS `chrome-extension://` couvert côté gateway.
- [x] **MP-08 (initial) — Build Firefox extension Pass** : `extensions/cloudity-pass-firefox/` dérivé du build Chrome + `manifest.firefox.json` (Gecko `pass@cloudity.local`) · `make build-pass-extension-firefox`. Safari = wrapper Xcode (reste ☐).

### L3 — fond de roadmap (après stabilisation Pass)

- [ ] Enrôlement multi-appareil **hybride PQ** X25519 + ML-KEM-768 (PASS-CRYPTO § 5) — bump `EnvelopeV1` → `v: 2`, lazy-migration.
- [ ] **WebAuthn / Passkeys** comme déverrouillage Pass (alignement WEBAUTHN-PLAN).

### Surveillance ressources continue (livrée 2026-05-13)

> **Règle permanente** : à chaque feature non triviale (> 200 lignes,
> nouvelle dépendance lourde, nouveau service, modif page > 1000 l), on
> capture un **snapshot avant** et un **snapshot après**, on lance
> `make perf-diff`, on colle le tableau dans la description du commit ou
> de la PR. Pas dans une UI : tout en CLI. Détail :
> **[docs/operations/PERFORMANCES-MONITORING.md](docs/operations/PERFORMANCES-MONITORING.md)**.

- [x] **PERF-CLI-01 — 4 scripts `scripts/dev/perf-*.sh`** : `perf-watch.sh` (TTY temps réel, couleurs vert/jaune/rouge selon budgets), `perf-snapshot.sh` (JSON horodaté dans `reports/perf/`, capture conteneurs + images + volumes + latences `/health` + DB Postgres), `perf-diff.sh` (diff humain ou `--json`, exit 1 si régression > seuil), `perf-budgets.sh` (gate one-shot, exit 0/1, `--json` pour ingestion).
- [x] **PERF-CLI-02 — 6 cibles Makefile** : `make perf-watch`, `perf-watch-once`, `perf-snapshot LABEL=…`, `perf-diff [BEFORE=… AFTER=…]`, `perf-budgets`, `perf-budgets-json`. Liste dans `make help` et dans le tableau **§ 0 Démarrage** de **STATUS.md**.
- [x] **PERF-CLI-03 — `docs/operations/PERFORMANCES-MONITORING.md`** : guide complet (10 sections) — outils, rituel checkpoint, template à coller dans la PR, budgets configurables, intégration CI/cron/pré-commit, anti-patterns, cas concrets.
- [ ] **PERF-CLI-04 — Pré-commit soft-fail** : ajouter un hook `.git/hooks/pre-commit` (ou `pre-push`) qui appelle `make perf-budgets` en mode warning (n'échoue pas le commit, mais affiche les violations). À cadrer après usage du rituel pendant 2-3 sprints.
- [ ] **PERF-CLI-05 — Ingestion CI** : dans le job e2e GitHub Actions, lancer `make perf-budgets-json` puis `POST /admin/performance/pipeline-run` (header `X-Cloudity-Perf-Ingest`) — la table `cloudity_performance_pipeline_runs` est déjà prête. Permet d'historiser la perf des PR.

### Tests & auth E2E / CI (hors « mode test » fragile)

- [x] **TEST-AUTH-01 — Bootstrap E2E/CI à secret fort** : **`POST /auth/e2e/bootstrap-mint`** puis **`POST /auth/e2e/bootstrap-exchange`** (OTP Redis **`GetDel`**, non rejouable). Garde-fous **`CLOUDITY_ALLOW_E2E_BOOTSTRAP=1`**, **`E2E_BOOTSTRAP_SECRET`** (≥ 32 car.), refus **`GO_ENV` / `NODE_ENV` = production** ; compte **2FA** → mint **403**. Gateway : pas de Bearer, rate-limit login/register. Détail **TESTS.md** § E2E.

### Anti-spam, anti-abus et messagerie (phasage AS-*)

> **Cadre** : filtrage **multi-couches** (edge → **api-gateway** → auth → services ; **et** MTA **Rspamd** pour le courrier Internet). **Chiffrement** : secrets boîte (AES-GCM) et **Pass** (E2EE client) **ne remplacent pas** le filtrage SMTP ni le MIME standard — voir **[docs/architecture/ANTI-SPAM-ET-ABUS.md](docs/architecture/ANTI-SPAM-ET-ABUS.md)** et **[docs/securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](docs/securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)**. Pistes externes (River, Chantilly, MLflow, Redis Streams) = **optionnel**, **après** Rspamd + UX Spam (M7).

- [x] **AS-0 — Documentation d’architecture** (2026-05-15) : `ANTI-SPAM-ET-ABUS.md` + `MAIL-CHIFFREMENT-ET-ANTI-SPAM.md` + liens **STATUS** / **SYNC-BACKLOG § 0e** / **SECURITE** / **DEV-VERIFICATION § 5** / **docs/README**.
- [ ] **MAIL-ALIAS-KEY-01 — `ALIAS_ENCRYPTION_KEY` côté Go** : la variable est dans **`.env.example`**, **`gen-secrets.sh`**, **`docker-compose`** (mail-directory) et **Portainer** (doc VPS) ; le service **ne l’utilise pas encore** pour chiffrer des colonnes alias — brancher quand un schéma sensible le exige (aligner **SECRETS.md** / migrations).

### Alias mail « vrais » (Pass → Mail, sans panneau OVH)

> **Vision** : **[docs/produit/MAIL-ALIAS-VISION.md](docs/produit/MAIL-ALIAS-VISION.md)** — ex. `hellowork@alias.<domaine-principal>`, réception triée dans Mail, envoi avec `From` alias, **pas de catch-all**. **MVP livré** : enregistrement + filtre + envoi partiel (**PASS-ALIAS-UI**).

> **Phase 2 en cours** : MTA auto-hébergé (`deploy/mail-mta`, API `/mail/internal/alias-resolve`, filtre `delivered_to` + `raw_headers`). Redirection fournisseur = secours. **MAIL-ALIAS-05** partiellement livré (lookup + stack squelette).

- [x] **MAIL-ALIAS-01** — `enabled` / désactivation temporaire sur `user_email_aliases` + UI Pass/Mail (migration **40**, PATCH API, Mail + Pass).
- [x] **MAIL-ALIAS-02** — À la création : règle filtre `recipient_pattern` = alias (dossier `inbox`, `rule_order` 900) — `ensureAliasInboundRule` au POST alias.
- [x] **MAIL-ALIAS-03** — `MAIL_ALIAS_SUBDOMAIN` / `MAIL_PRIMARY_DOMAIN` + GET `/mail/me/alias-config` + validation `*@alias.<domaine>` ; UI domaine (Mail/Pass) + saisie local-part.
- [ ] **ARCH-DHT-01** — **Phase tardive** : réseau décentralisé (DHT, relais chiffré, pairs sans IP exposée) — cadrage **[docs/decisions/ARCHITECTURE-RESEAU-DECENTRALISE.md](docs/decisions/ARCHITECTURE-RESEAU-DECENTRALISE.md)** ; hors MVP.
- [ ] **MAIL-STOR-01** — Cache mail PostgreSQL + politique rétention + purge IMAP optionnelle (quota fournisseur) — **[docs/produit/MAIL-STOCKAGE-CACHE.md](docs/produit/MAIL-STOCKAGE-CACHE.md)**.
- [ ] **MAIL-ALIAS-04** — Extension / Pass : bouton « Alias pour ce site » (localpart depuis hostname).
- [ ] **MAIL-ALIAS-05** — MTA Cloudity : lookup alias livré (`/mail/internal/alias-resolve`) ; reste prod hardening (Maddy conf, injection IMAP directe, **5a** API OVH optionnelle). Guide : **[MAIL-ALIAS-RECEPTION.md](docs/produit/MAIL-ALIAS-RECEPTION.md)** · **[MAIL-MTA-LOCAL-TEST.md](docs/operations/MAIL-MTA-LOCAL-TEST.md)**.
- [ ] **MAIL-ALIAS-06** — Envoi : destinataire voit l’alias en `From` + DKIM/SPF cohérents sur `alias.*`.
- [ ] **AS-1 — Stack MTA + Rspamd + M7 UI Spam** : Postfix + Dovecot + Rspamd (déjà listé **STATUS** « Stack mail ») ; dossier Spam, marquer spam/ham, scoring Rspamd ; SPF/DKIM/DMARC minimal — **avant** tout microservice ML dédié.
- [ ] **AS-2 — Rate limits gateway granulaires** : Redis (préfixes `ratelimit:`), limites par route (`/auth/login`, `/mail/me/send`, …), alignement **SECURITE.md** / **BACKLOG** (WAF edge complémentaire).
- [ ] **AS-3 — WAF / fail2ban** : ModSecurity CRS mode détection ; **fail2ban sur hôte VPS** (journal nginx), pas dans le conteneur applicatif.
- [ ] **AS-4 — Observabilité décisions anti-abus** : métriques compteurs / histogrammes — dans le périmètre **TR-06** ; **ne pas** annoncer Grafana/Prometheus tant que non ajoutés au compose.
- [ ] **AS-5 — `antispam-service` (Python) + ML online (River)** : scoring async, **timeout + fallback** règles statiques ; Redis Streams pour features ; **MLflow** optionnel (registry) ; **Vowpal Wabbit** seulement si volume extrême — évaluation après AS-1 stable.

### Refactor frontend — fichiers > 1000 lignes (cadré 2026-05-13)

> Constat : `MailPage.tsx` (6576 l), `DrivePage.tsx` (3228 l), `api.ts`
> (2191 l), `DocumentEditorPage.tsx` (1388 l). Ces tailles freinent la
> maintenance et la revue de PR. Découpe **un fichier par PR**, validé
> par typecheck + Vitest + Playwright + smoke navigateur. Plan complet :
> **[docs/architecture/FRONTEND-LAYOUT.md § 5](docs/architecture/FRONTEND-LAYOUT.md)**.

- [ ] **REFACTOR-FE-01 — `api.ts` (2191 l) → `src/api/<domaine>.ts`** : auth, drive, mail, pass, photos, calendar, notes, tasks, contacts, office, admin, performance, webauthn + `index.ts` qui ré-exporte (compat). Purement mécanique, pas de logique UI touchée. **À faire en premier** (impact transverse, mais risque maîtrisé).
- [ ] **REFACTOR-FE-02 — `MailPage.tsx` (6576 l)** : extraire `MailListPanel` / `MailReadingPanel` / `MailComposer` / `MailFolderTree` + dossier `pages/app/mail/hooks/`. À faire **après** stabilisation conversation 2FA / Pass (impact UI fort).
- [ ] **REFACTOR-FE-03 — `DrivePage.tsx` (3228 l)** : `DriveBrowser` / `DriveBreadcrumbs` / `DriveContextMenu` / `DriveUploadOverlay` + hooks dédiés.
- [ ] **REFACTOR-FE-04 — `DocumentEditorPage.tsx` (1388 l)** : sous-modules `office/word/`, `office/spreadsheet/`, `office/presentation/` (déjà mentionné FRONTEND-LAYOUT § 2).

### Surfaces clientes manquantes (matrice MULTI-PLATEFORME.md)

> **Cadre** : décision 2026-05-13 — l'utilisateur a explicitement demandé de **lister et préparer** toutes les surfaces clientes attendues (extension navigateur Pass, app Linux Pass, app mobile Calendar, apps Linux desktop pour Drive/Photos/Mail). Le squelette extension MV3 et le placeholder `mobile/calendar/` sont livrés ce jour. Les autres restent à scaffolder selon l'ordre rentable (cf. **[MULTI-PLATEFORME.md § 3](docs/produit/MULTI-PLATEFORME.md)**).

- [x] **MP-01 — Extension navigateur Pass MV3** : squelette livré (cf. L2).
- [x] **MP-02 — `mobile/calendar/` placeholder** : README + `pubspec.yaml` stub livrés. Pas de scaffold `flutter create` tant que le backend `calendar-service` et la page web Calendar ne sont pas amorcés (cf. règle « web avant mobile » MOBILES.md § 0).
- [ ] **MP-03 — Cible `linux/` Flutter pour `mobile/mail`** : aujourd'hui Mail n'a que `android/` + `ios/`. À scaffolder par `flutter create --platforms=linux .` quand le chantier desktop Mail démarre. Drive / Photos / Pass ont déjà leurs cibles `linux/` (mais seul Pass a été testé).
- [x] **MP-04 — Validation Linux desktop Drive/Photos** : `make test-mobile-desktop-linux` ajouté ; `flutter test` + `flutter build linux --debug` OK pour `mobile/drive` et `mobile/photos`. Correctif ciblé CMake : `-Wno-error=deprecated-literal-operator` pour le `json.hpp` de `flutter_secure_storage_linux` avec Clang/Arch récents.
- [ ] **MP-05 — Service backend `calendar-service` + page web Calendar** : pré-requis avant de scaffolder l'app mobile (cf. ROADMAP APP-05). Estim. 5-7 j. Embarque migrations DB events/recurrences + endpoints REST + interop iCal/CalDAV.
- [x] **MP-06 — Autofill réel extension Pass** : voir L2 (initial livré).
- [x] **MP-07 — Tests Playwright extension** : voir L2.
- [x] **MP-08 (initial) — Firefox extension Pass** : build dérivé + README ; Safari ☐.

### Release & distribution (prod partielle, OTA mobile, NPM)

> **Cadre complet** : **[DEPLOIEMENT-ENVIRONNEMENTS.md](docs/operations/DEPLOIEMENT-ENVIRONNEMENTS.md)** (hub) · **[DEPLOIEMENT-PAR-SERVICE.md](docs/operations/DEPLOIEMENT-PAR-SERVICE.md)** · **[PORTAINER-VPS.md](docs/operations/PORTAINER-VPS.md)** · **[RELEASE-AND-DISTRIBUTION.md](docs/operations/RELEASE-AND-DISTRIBUTION.md)**.

- [ ] **DEPLOY-SUIVI-01** — Suivre **[DEPLOIEMENT-SUIVI.md](docs/operations/DEPLOIEMENT-SUIVI.md)** : Phase A local → B PR/CI → C stacks Portainer (dev/preprod/prod).
- [ ] **DEPLOY-DOC-01** — Templates Compose dans **`deploy/portainer/`** (infra, identity, web, mail, pass) pour Portainer CE.
- [ ] **DEPLOY-DNS-01** — DNS `api.cloudity.<domaine>` (A + NPM) + `CORS_ORIGINS` / `VITE_API_URL` par environnement.
- [ ] **DEPLOY-PORTAINER-02** — Script ou doc « Update stack » : pull GHCR tag + redeploy (semi-auto après `docker-publish`).
- [ ] **DEPLOY-PR-01** — PR `feat/photos-gallery-mobile-sync-security` → `dev`, puis `dev` → `main` quand tests verts.

- [ ] **REL-01** — Canal **`version.json` + APK** signés par app Flutter (Mail, Drive, Photos, Pass) ; hébergement **HTTPS** (GH Releases, stockage objet, ou endpoint gateway lecture seule).
- [ ] **REL-02** — CI ou script : publication **APK** + mise à jour **`version.json`** (empreinte **SHA256**).
- [ ] **REL-03** — UI in-app « mise à jour » sur **Android** (`PackageInstaller` / intent) + tests sur au moins **2** constructeurs.
- [x] **PASS-ALIAS-UI** — Création **alias mail** depuis l’**UI Pass** web (`PassMailAliasesPanel`, API `POST /mail/me/accounts/:id/aliases`) — **[SYNC-BACKLOG.md](docs/produit/SYNC-BACKLOG.md)** § 2.
- [ ] **PASS-AUTOFILL-ANDROID** — Service **Autofill** Android pour Pass (pas d’équivalent universel iOS documenté ici).

> **Anti-pattern à éviter** (documenté MULTI-PLATEFORME.md § 5) : ne **pas** scaffolder `mobile/notes`, `mobile/tasks`, `mobile/contacts` tant qu'il n'y a pas de backend ni de parcours utilisateur réel. Un scaffold flutter-create vide n'est **pas** un livrable.

### Reportés post-20 mai (5 chantiers infra évalués 2026-05-13)

> Décision 2026-05-13 : ne pas démarrer ces 5 items pendant le sprint Pass (coût total ~5,5 j, dont 2 j à risque de régression élevée). Ordre recommandé après le 20 mai : sécu d'abord (4-5), doc d'abord ensuite (1-2). Item 3 **livré** (cf. § 10 bis DEPLOIEMENT-VPS-PORTAINER-NPM.md).

- [ ] **(1)** `docs/cloudity-api-contracts/` — OpenAPI par service (Phase 0 du dégèle multi-repo).
- [ ] **(2)** Split Portainer : `compose/identity.yml`, `compose/mail.yml`, `compose/pass.yml`, etc. ; un stack par domaine.
- [x] **(3)** Procédure rollback documentée § 10 bis DEPLOIEMENT-VPS-PORTAINER-NPM.md (Cas A applicatif / B DB / **C migration Proton** / D NPM-TLS + smoke + post-mortem) — **livré 2026-05-13**.
- [ ] **(4)** mTLS `MTLS_MODE=strict` sur `mail-directory-service` puis cascade (`auth-service` → `passwords-service` → `mail-search-service` → `pictures-service` → `drive-service` → `comm-service` → `admin-service`). Aujourd'hui : `permissive` partout.
- [ ] **(5)** Postgres `sslmode=verify-full` + Redis `--tls-auth-clients yes` avec **certs clients par service** (un cert par identité de service consommateur, émis par step-ca avec SAN SPIFFE).

---

## Démarrage rapide (ordre recommandé)

| Étape | Action |
|-------|--------|
| 0 | *(Optionnel mais recommandé)* Lire **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)** pour le cadre *Google + Proton* et les phases |
| 1 | **`make setup`** (ou `./scripts/dev/setup.sh`) si première machine |
| 2 | **`make up`** ou **`make up-full`** (seed démo : `admin@cloudity.local` ; mot de passe défini par la cible `seed-admin`, voir `Makefile`) |
| 2b | Quand de nouveaux **`infrastructure/postgresql/migrations/*.sql`** apparaissent (sync du dépôt ou branche) : **`make migrate`** ou **`make rebuild`** — **TESTS.md** (Migrations) |
| 3 | Attendre **20–30 s** puis ouvrir http://localhost:6001 |
| 4 | **`make test`** (Docker requis) avant tout merge |
| 5 | E2E navigateur : **`make seed-admin`** puis **`make test-e2e-playwright`** |

**URLs** : app http://localhost:6001 · API gateway http://localhost:6080 · détail **STATUS.md** §0.

---

## Priorités — deux niveaux (à lire ensemble)

1. **Stratégie long terme** (*quoi valoriser en premier comme suite*) : **[docs/produit/VISION-SUITE.md](docs/produit/VISION-SUITE.md)** — Mail → Alias → Pass → Photos → Drive → Contacts/Calendar → Office, avec fondation transverse (perf **PERFORMANCES.md**, sécu **SECURITE.md**, recherche).
2. **Backlog exécutable ci-dessous** — ordre **pratique avril 2026** sur le dépôt : chantiers **parallèles** (Mail déjà très avancé, Photos mobile + web, Pass, Drive…) tel que **STATUS** et **TODO**.

| # | Sujet | Détail / lien |
|---|--------|----------------|
| **0** | **Pass (sprint ~20 mai)** | **Priorité absolue** — **[docs/produit/SPRINT-PASS-2026-05.md](docs/produit/SPRINT-PASS-2026-05.md)** + **BACKLOG** § sprint ; **ROADMAP APP-04** |
| 1 | **Photos** | API timeline, galerie web, **mobile/photos**, sync sobre — **docs/produit/PHOTOS.md** |
| 2 | **Mail** | Dossiers IMAP §0b SYNC-BACKLOG (dont **logs** probes / gateway), recherche §9, PJ, archivage §1 |
| 3 | **Contacts** | Groupes, import/export ; **lien Mail ↔ fiches** (liaison riche, règles) **après MVP Mail web** — l’ouverture contact depuis un message existe déjà côté UI |
| 4 | **Recherche** | **Livré (MVP web)** : palette **Ctrl+K**, `?q=` : filtre **client** dans le dossier courant **ou** recherche **API** sur **tout le Drive** si `q` non vide (`GET /drive/nodes/search`) + lien Contacts ; **À faire** : recherche cross-apps (Mail, Pass…) — **TESTS.md** §4.0 |
| 5 | **Architecture front** | Monorepo multi-apps — **STATUS.md** §0b (**A1** ✅ ; **A4** `@cloudity/ui` **en cours** ; **A2/A3** API) |
| 5b | **UI-DS-01** — Design system | **UI-1** ✅ package + admin + `/4dm1n/dev/ui` + responsive + polish admin (`Users`, `Domaines`, CVE, Passkeys, Settings) — suite UI-3 Pass/Settings utilisateur — **[CLOUDITY-UI-DESIGN-SYSTEM.md](docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md)** · **`feat/cloudity-ui-design-system`** |
| 6 | **Drive mobile** | MVP **`mobile/drive`** (liste) + tests **`make test-mobile-drive`** ; alignement barre (loupe, notif) — **MOBILES.md** |
| 7 | **Sécurité transverse** | Phases §3 **SECURITE.md** + durcissement **SECURITE-DONNEES.md** ; pas de doublon avec ROADMAP TR-01 |
| 8 | **Observabilité & performances** | Mesure détaillée (web, gateway, services Go, Flutter) ; budgets / p95 ; pistes d’optimisation **sans** rogner **SECURITE.md** ni l’UX — **docs/operations/PERFORMANCES.md**, **ROADMAP TR-06** |

### Suite « Google + Proton » (rappel)

Ordre **must-have** : sync/versioning/corbeille → partage propre → backup photo → E2EE espaces privés → galerie riche → recherche privée / anti-abus. Détail des **4 couches** et **phases 1–4** : **[docs/securite/SECURITE.md](docs/securite/SECURITE.md)**.

---

## Architecture multi-repos GitHub (**gelée depuis 2026-05-13**)

**Statut** : la **scission en plusieurs dépôts GitHub** est **mise en pause** le temps du **sprint Pass** (échéance ~20 mai 2026). Le **monorepo actuel** reste canonique ; les travaux Phase 0 (versionnage libs, `check-versioning`, GHCR, NPM) **continuent** dans ce dépôt. Reprise du split **après** critères verts dans **[docs/produit/SPRINT-PASS-2026-05.md](docs/produit/SPRINT-PASS-2026-05.md)** § 5.

Cible historique (inchangée sur le fond) : casser le monorepo en **dépôts GitHub indépendants** (un par service / app / lib partagée) regroupés sous un **meta-repo** `cloudity` qui garde `docker-compose.yml`, `infrastructure/`, docs transverses, E2E.

**Plan détaillé** : **[docs/architecture/MULTI-REPO-LAYOUT.md](docs/architecture/MULTI-REPO-LAYOUT.md)** — couvre : carte des dépôts (~17–25), trois options techniques (submodules / subtrees / manifeste / monorepo + CODEOWNERS), prérequis Phase 0 (extraire **`backend/pkg/dbpin`**, versionner **`internalsec`**, **`@cloudity/shared`**, **`cloudity_shared`** Dart), intégrations cross-app (Mail ↔ Contacts, Pass ↔ Mail aliases, Drive ↔ Mail PJ) **via le gateway** + contrats **OpenAPI**, tests par niveau (unit / contract / E2E), et production **Portainer + nginx-proxy-manager** (mono-stack vs stacks par domaine, NPM TLS / hostnames, backup **Restic** + résilience UI).

**Questionnaire** : **[docs/decisions/multi-repo/QUESTIONNAIRE.md](docs/decisions/multi-repo/QUESTIONNAIRE.md)** — détail des options.  
**Réponses** : **[docs/decisions/multi-repo/REPONSES.md](docs/decisions/multi-repo/REPONSES.md)** (Q1=A, Q2=D, Q3=A, Q4=B, Q5=A, Q6=B, Q7=C, Q8=archi custom, Q9=D+T3, Q10=A).

Décisions actées (résumé exécutable) :

| Q | Décision | Conséquence |
|---|----------|-------------|
| Q1 | Polyrepo + meta-repo + `git submodule` | Le meta-repo `cloudity` listera des submodules vers les sous-dépôts. |
| Q2 | **Monorepo backend** (`cloudity-backend`) | Tous les services Go + `admin-service` Python restent dans un seul dépôt — pas de scission service par service côté API. |
| Q3 | 1 dépôt par app mobile Flutter | `cloudity-mobile-mail`, `…-drive`, `…-photos`, `…-pass`, `…-admin` à terme. |
| Q4 | **Publication publique** des libs partagées | `@cloudity/shared` sur npm.org, `cloudity_shared` sur pub.dev, modules Go publics. ⇒ aucun secret, schéma DB, ou logique métier sensible dans ces libs. |
| Q5 | `infrastructure/` reste dans le meta-repo | Migrations SQL, reverse-proxy, step-ca centralisés. |
| Q6 | CI principalement meta-repo | Workflow `make test` global qui clone les sous-dépôts ; CI unitaire dans chaque sous-dépôt en complément. |
| Q7 | **Stacks Portainer par domaine produit** | Mail / Drive / Pass / Photos / Identity / Comm / Web / Infra / Backup en stacks séparées (cf. REPONSES.md § Q7). |
| Q8 | **Agent backup distribué offsite** (cf. **[docs/architecture/BACKUP-OFFSITE.md](docs/architecture/BACKUP-OFFSITE.md)**) | Pas de conteneur backup co-localisé sur le VPS — runner sur machine tierce (raspberry / PC perso). |
| Q9 | Extension Pass + desktop Linux : **plus tard**, stack à arbitrer | POC Tauri vs Electron quand le chantier deviendra actionnable. |
| Q10 | **Phase 0 immédiate** | Extraction `backend/pkg/dbpin` + versionnage libs **maintenant**. |

À faire (Phase 0, en cours) :

- [x] **Phase 0 / pkg/dbpin — étape 1** : module `backend/pkg/dbpin` créé (`DbExec`, `Conn`, `NewConn`, `WithConn`, `From`) + tests + ajout `go.work`.
- [ ] **Phase 0 / pkg/dbpin — étape 2 (pilote)** : migrer `drive-service` vers le module partagé (volume Compose `./backend/pkg:/app/pkg:cached` + `replace` go.mod + wrapper local de 10 lignes). Valider via `make rebuild` complet.
- [ ] **Phase 0 / pkg/dbpin — étape 3 (propagation)** : appliquer la même bascule à `photos-service`, `contacts-service`, `notes-service`, `calendar-service`, `tasks-service`. **Suppression** des 6 `dbpin.go` locaux historiques en bout de chaîne.
- [x] **Phase 0 / versionnage v0.1.0** : `internalsec` (`VERSION` + `CHANGELOG.md`), `pkg/dbpin` (`CHANGELOG.md`), `@cloudity/shared` (`package.json` + `CHANGELOG.md`), `cloudity_shared` Dart (`pubspec.yaml` + `CHANGELOG.md`) + doc cadre **[docs/architecture/VERSIONNAGE-LIBS.md](docs/architecture/VERSIONNAGE-LIBS.md)**. **Tags Git non poussés** tant que l'org GitHub publique n'est pas fixée (cf. Q4=B).
- [ ] **Phase 0 / contrats** : esquisser **`docs/cloudity-api-contracts/`** (OpenAPI par service — gateway, mail, drive, pass, calendar, contacts, notes, tasks, photos, admin).
- [x] **CI** — `scripts/ci/check-versioning.sh` (Phase 0) : couvre `internalsec` / `pkg/dbpin` / `@cloudity/shared` / `cloudity_shared` (Dart). Union diff `merge-base...HEAD` + index + working tree. Mode WARNING par défaut, `CHECK_VERSIONING_BLOCKING=1` pour fail. Cible **`make check-versioning`** + intégration **`make test-security`** (rapport `reports/security-check-versioning.txt`). Doc **[docs/architecture/VERSIONNAGE-LIBS.md § 6](docs/architecture/VERSIONNAGE-LIBS.md)**.

À faire (Phase ultérieure) :

- [ ] **Stacks Portainer** : éclater le `docker-compose.yml` actuel en fichiers Compose **par domaine** (`compose/identity.yml`, `compose/mail.yml`, …) avec réseaux Docker partagés ; documenter dans `docs/operations/STACKS-PORTAINER.md`.
- [x] **Reverse proxy NPM (2026-05-12)** : section **§ 4 bis** ajoutée à **REVERSE-PROXY.md** — table des 3 Proxy Hosts, blocs « Advanced » prêts à coller (`api.` / `app.` / `admin.cloudity.<DOMAIN>`), table des limites NPM (HTTP/3 et PQ Q18/Q19 à activer plus tard via bascule Caddy / nginx natif), tests rapides via **`make smoke-prod`**. Aligné avec Q22=A (réutiliser `<EDGE_NETWORK>`) et Q23=A (`cloudity.<DOMAIN>` + sous-domaines). **Hygiène** : valeurs réelles hors Git (Portainer Stack Variables ou `.env.deploy.local` git-ignored) ; placeholders neutres dans tous les `.md`.
- [ ] **Backup offsite** : POC tunnel + agent VPS + runner local (cf. **[docs/architecture/BACKUP-OFFSITE.md](docs/architecture/BACKUP-OFFSITE.md)** § 7) — démarrage **après** stabilisation Mail / Photos / Pass.
- [ ] **Extension Pass + desktop Linux** : POC stack Tauri vs Electron + bootstrap des dépôts dédiés (cf. Q9 = D, **après** stabilisation produit).

---

## Homelab / sécurité résidentielle (**bloquant pour la mise en production** — Q15=A)

Cible : **Raspberry Pi à la maison** + 2 disques USB (1 To, 500 Go) ; sert de **runner backup offsite Cloudity** (cf. **[docs/architecture/BACKUP-OFFSITE.md](docs/architecture/BACKUP-OFFSITE.md)**) + **point d'accès distant** (web `/4dm1n` + mobile admin) via VPN.

**Cadre détaillé** : **[docs/architecture/HOMELAB-SECURITE.md](docs/architecture/HOMELAB-SECURITE.md)**.

**Décisions actées** (REPONSES.md § Q11–Q15) :

| Q | Choix | Conséquence |
|---|-------|-------------|
| Q11 | **A** scénario réseau **minimal** | RPi sur LAN, box FAI inchangée, pas de filtrage trafic foyer pour démarrer |
| Q12 | **A** hub USB 3.0 alimenté + disques tels quels | ~25 € à acheter |
| Q13 | **B** WireGuard + **Headscale self-hosted** | Conteneur Headscale sur RPi, MagicDNS, ACLs déclaratives |
| Q14 | **A** nettoyage outillé | ncdu + rmlint + tar.zst -19 + LUKS + ext4 |
| Q15 | **A** **homelab avant prod** | **H1 bloquante** pour le déploiement Cloudity sur VPS |

**Achats à faire** :

- [ ] **Hub USB 3.0 alimenté 4 ports** 5V/4A (Anker / Sabrent / Inateck) — ~25 € *(obligatoire)*
- [ ] *(Recommandé)* SSD M.2 USB 256 Go (~40 €), boîtier RPi avec dissipation passive (~30–50 €), UPS 600 VA (~70 €)

**À faire** :

- [ ] **H0 — Inventaire matériel précis** : modèle RPi exact (3B/4B/5 + RAM), capacité réelle des 2 disques USB, état box FAI (mode bridge possible ?), modèle smartphone admin.
- [ ] **H0 — Nettoyage des 2 disques** (Q14=A) : `ncdu` (tri manuel) + `rmlint` (doublons) + compression `tar.zst -19 --long=27` des archives froides + **LUKS** + **ext4** (cf. **HOMELAB-SECURITE § 2**).
- [ ] **H0 — Achat matériel** : hub USB 3.0 alimenté minimum (cf. ci-dessus).
- [ ] **H1 — OS Raspberry Pi** : Bookworm 64-bit Lite + SSH key-only + dropbear-initramfs pour LUKS unlock à distance.
- [ ] **H1 — Disques** : LUKS + ext4 + montage automatique `/mnt/cloudity-1tb` `/mnt/cloudity-500gb` (`/etc/fstab` avec `nofail`).
- [ ] **H1 — Headscale** (Q13=B) : conteneur Docker sur RPi, port UDP 41641 port-forward depuis box FAI + géoblocage nftables (FR + IP roaming connues), enregistrer PC fixe + smartphone admin + RPi elle-même comme premiers nodes. ACLs en mode **deny-all** + whitelist explicite.
- [ ] **H1 — Tester accès distant** depuis l'extérieur (4G ou réseau ami) → mobile admin et PC fixe atteignent la RPi via Headscale.
- [ ] **H1 — `cloudity-backup-runner`** (binaire Go) : à coder une fois la Phase 0 multi-repo terminée. Panel local sur port 7080, exposé uniquement via interface Tailscale/Headscale.
- [ ] **H3 — Monitoring** : agent métriques RPi (`node_exporter` + collecteur Go custom) → endpoint runner exposé en mTLS → admin-service interroge via canal long-lived → page `/4dm1n/homelab` (web) + écran `mobile/admin`.
- [ ] **H3 — Alertes push** : pas de handshake WG > 24 h, pas de backup > 48 h, T° RPi > 80 °C, disque > 90 %.
- [ ] **H4 — Bascule production Cloudity** : **uniquement** une fois H1+H3 livrés. Jusque-là, Cloudity reste **local**.

**Différé** (selon Q11=A) : phase H2 (sécurité réseau approfondie : nftables routeur, Pi-hole, VLANs) — à reprendre quand 5+ équipements à filtrer dans le foyer ou avant la prod si on veut une DMZ logique pour la RPi prod-bound.

Hors scope court terme — explorations IoT :

- [ ] **Gamelle connectée chat** (Arduino + capteur poids/RFID) en VLAN IoT (nécessite passage à scénario B/C plus tard), exposée via mini-service Cloudity côté famille (notifications « le chat a mangé », poids hebdo). Démarrage seulement après H1–H3 livrées et passage scénario réseau B ou C.

---

## Sprint fin mai 2026 — cible migration type Proton

Objectif : usages **quotidiens** **web + mobile** pour **Mail**, **Drive**, **Photos** ; **Pass** au minimum **web** fiable ; **app Pass mobile** et **extension navigateur Pass** dès que le contrat API / UX web est figé.

| Bloc | Web | Mobile | Notes |
|------|-----|--------|-------|
| **Photos** (galerie + sync) | Timeline, albums web + mobile, upload web | `mobile/photos` : **WorkManager** initial (sauvegarde galerie → Drive `Photos`, Wi‑Fi / charge, lots 12) — reprise curseur / SQLite · iOS sync ☐ — **PHOTOS.md** § 4–5 |
| **Mail** (dont alias) | Très avancé ; alias boîte **MVP** ; alias domaine (**`/4dm1n`** → Domaines) | `mobile/mail` : envoi, PJ, dossiers ; **reste** : brouillon serveur, push — **MOBILES.md** § 5 |
| **Drive** | Récents, corbeille, recherche `?q=` | `mobile/drive` : navigation dossiers ; vérifier **upload** / téléchargement vs besoin Proton |
| **Pass** | MVP coffre web + **`mobile/pass` Flutter LECTURE SEULE** (J7 sprint Pass : crypto Dart interop bit-à-bit web, écrans login/unlock/vaults/items/détail, copie auto-clear 30 s, auto-lock 5 min, lock à chaque pause/background) | **Édition mobile = L2** ; **extension navigateur** : chantier **non démarré** (cible **MV3**, dossier type `extensions/cloudity-pass/`) — **ROADMAP APP-04** |

**Checklist tests manuels** (toi, après `make up` + compte) : **Mail** envoi/réception, PJ, création **alias boîte** + réception ; **alias domaine** (admin + DNS si domaine réel) ; **Drive** upload + corbeille + recherche ; **Photos** import web + même compte sur **app mobile** ; **Pass** CRUD + session.

---

## À faire (extraits — non exhaustif)

### Infra base de données (migrations)

- [ ] **Outil / panneau migrations** : CLI ou service + **admin web** + **admin mobile** — état des migrations, version, garde-fous (pas d’exécution SQL libre sans audit) — **SYNC-BACKLOG §0d**, **PLAN §11**, **TESTS.md**.

### Sécurité & infra (voir **SECURITE.md**)

- [x] **Norme cryptographique** : nouveau référentiel actionnable **[docs/securite/CRYPTO-NORME.md](docs/securite/CRYPTO-NORME.md)** (whitelist/blacklist algos, paramètres Argon2id, TLS curves, plan migration JWT EdDSA, checklist code review).
- [x] **Argon2id renforcé (auth-service)** : `argon2id.DefaultParams` (m=64MB t=1 p=2) → params explicites m=64MB t=3 p=4 (×6 sur le coût brute-force GPU/ASIC). Override par env `ARGON2_MEMORY_KB` / `ARGON2_TIME` / `ARGON2_PARALLELISM`. Test unitaire ajouté.
- [x] **TLS X25519 first (internalsec v0.2.0)** : `CurvePreferences = [X25519, secp256r1]` posé explicitement sur `ServerTLS` et `ClientTLS`. CipherSuites laissé géré par Go (TLS 1.3 only ⇒ tout AEAD).
- [x] **Gateway — anti-énumération & durcissement** : 404/405 JSON homogènes ; en-têtes `nosniff` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` ; rate limit global + **login/register** ; `429` en JSON ; **`Cache-Control: no-store`** sur `/auth/*`, `/pass/*`, `/admin/*` ; auth : message inscription doublon générique, plancher temps réponse login — **SECURITE.md** § 6.1, tests `TestSensitivePath_*`, `TestLoginRateLimit_*`, `TestUnknownPath_*`.
- [x] **Frontend** : `public/robots.txt` (`Disallow` `/4dm1n`, `/admin`, `/auth/`, etc.) ; navigation **shell utilisateur ↔ admin** en pleine page (`window.location.assign`) pour charger le bon bundle.
- [x] **Admin UI — suppression `/admin* → /4dm1n`** : pas de redirection SPA ; **404** explicite côté Vite + nginx — **`docs/securite/AUDIT-SECURITE.md` §1**, `frontend/apps/cloudity-web/{vite.config.js,nginx.conf,src/AdminApp.tsx}`.
- [x] **Admin UI — polish exploitation (2026-05-20)** : Domaines résiste aux réponses liste `null`, Users clarifie dernière connexion / 2FA / statut actif, Dashboard explique le mode cgroup sans Docker, CVE affiche priorités par paquet, Passkeys/Settings cadrent web vs mobile/extension. **Reste** : reset 2FA utilisateur sécurisé (step-up admin + audit + codes de récupération).
- [x] **Gateway — `/admin/*` durcie** : JWT admin obligatoire partout + contrôle **`Origin`** + double jeton `POST /admin/performance/pipeline-run` (`Authorization` + `X-Cloudity-Perf-Ingest` / `PERFORMANCE_INGEST_TOKEN`) — **`docs/securite/AUDIT-SECURITE.md` §2–3**, `docker-compose*.yml`, `scripts/ci/test-e2e.sh`, `scripts/ci/report-pipeline-run.sh`.
- [x] **admin-service — ingestion perf** : `PERFORMANCE_INGEST_TOKEN` **obligatoire** (sinon **503**) — évite l’ingestion « ouverte » si la variable est absente.
- [x] **Mail admin-only Zero Trust** : double contrôle gateway (JWT + rôle admin + `Origin`) **et** `mail-directory-service` (`X-Admin-Role: admin` requis sur `/mail/{domains,mailboxes,aliases}*`). La gateway **strippe** `X-User-ID`/`X-Tenant-ID`/`X-Admin-Role` à l'entrée (`stripInternalTrustHeaders`) — **`docs/securite/AUDIT-SECURITE.md` §2.4**, `docs/securite/SECURITE.md §6.2`, tests Go `TestStripInternalTrustHeaders`, `TestMailDomainsRequiresAdminRole`, `TestIsAdminOnlyMailDirectoryPath`.
- [x] **Helper secrets** : `make secrets` (256 bits POSTGRES/REDIS/JWT/PERFORMANCE_INGEST_TOKEN) — `scripts/dev/gen-secrets.sh`. Utilisé pour Portainer prod (`docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md` §10).
- [x] **HTTPS dev local** : `make dev-https` (mkcert + Vite https://localhost:5173) — `scripts/dev/dev-https.sh`, `frontend/apps/cloudity-web/vite.config.js` (lecture `VITE_HTTPS_KEY`/`CERT`).
- [x] **Politique secrets** : nouveau guide **`docs/securite/SECRETS.md`** (inventaire, génération, rotation, gitleaks, procédure incident). `.gitignore` durci (`.env.*`, `*.pem`, `*.key`, `step-ca/secrets/*`, dumps SQL). `MAIL_PASSWORD_ENCRYPTION_KEY` placeholder = 64 zéros (refusé au runtime via `validateMailEncryptionKeyAtBoot`). Untrack `.env.dev` (vide) et `auth-service/public.pem` (régénéré au boot).
- [x] **`gitleaks` dans `make test-security`** : scan historique git complet, mode WARNING (`GITLEAKS_BLOCKING=1` pour fail). Audit baseline 2026-05-12 : 157 commits scannés, 0 fuite. Cibles `make secrets-scan` (audit) et `make secrets-scan-staged` (avant commit).
- [x] **PoC mTLS step-ca** : nouvelles cibles **`make mtls-issue NAME=<svc>`**, **`make mtls-verify NAME=<svc>`**, **`make mtls-poc`** (chaîne complète : up → seed → 2 certs → vérif). Chaîne CA bundle (root + intermediate) → `openssl verify` OK. SAN SPIFFE `spiffe://cloudity.local/ns/default/sa/<svc>` posé. Test d'intégration Go `TestStepCAIssuedCertsHandshake` (gated `INTERNALSEC_STEPCA_INTEGRATION=1`) valide handshake TLS 1.3 + `RequireServiceCallerHTTP` avec certs **réels** émis par step-ca. Reste à câbler : monter `MTLS_*` sur api-gateway → admin-service en `permissive`.
- [x] **HTTPS par défaut (edge + interne)** : nouvelles cibles **`make up-tls`** (stack + Caddy edge `https://app.cloudity.local` / `https://api.cloudity.local`) et **`make up-https-internal`** (Postgres TLS `sslmode=verify-ca` + Redis TLS). Override **`docker-compose.https.yml`** (bind-mount PEM Postgres + `make mtls-chown-internal-certs`). **auth-service** : `REDIS_TLS=1` + `newRedisClient()` (go-redis TLS avec CA step-ca). Cibles `mtls-issue-postgres` / `mtls-issue-redis` (TTL **24 h** max provisioner par défaut) + `https-status`. Section **`AUDIT-SECURITE.md` § 6 bis**.
- [ ] **mTLS strict** : passer chaque lien `gateway → service` en `MTLS_MODE=strict` (séquence prévue : mail-directory → autres ; admin-service et auth-service sont déjà cert-aware en `permissive`).
- [x] **Gateway → auth-service en mTLS** : import `internalsec` + bascule `r.Run` → `http.Server.ListenAndServeTLS` quand `MTLS_MODE != off` ; `docker-compose.https.yml` monte les certs auth-service step-ca, sépare CA Postgres / CA Redis (deux paths distincts pour ne pas écraser `/run/step/ca.pem` qui sert maintenant pour mTLS server). `make mtls-issue-auth` (auto par `make up-https-internal`). Test unitaire `TestAuthServiceListensInTLSWhenMTLSPermissive` (cert ECDSA P256 auto-signé local). Tests Go ✅.
- [x] **Gateway → admin-service en mTLS** : `internalsec.InternalRoundTripper(ConfigFromEnv())` câblé dans `httputil.ReverseProxy.Transport` ; `admin-service` (uvicorn) lance `start.sh` qui passe en `--ssl-*` quand `MTLS_MODE=permissive|strict` ; `make up-https-internal` émet automatiquement les certs `api-gateway` + `admin-service` (`make mtls-issue-admin`). Variables `*_SERVICE_URL` injectables sur la gateway pour basculer chaque service séparément.
- [x] **`Dockerfile.prod` + GHA `docker-publish.yml` (Q24=A)** : images multi-stage publiées sur **GHCR** (`ghcr.io/<owner>/cloudity-<svc>`) à chaque push `main` ou tag `v*.*.*`. Go services en `gcr.io/distroless/static-debian12:nonroot` (build statique `-trimpath -ldflags="-s -w"`), `admin-service` en `python:3.11-slim` non-root (uid 1000), api-gateway buildé depuis `backend/` (replace `../internalsec`). Builds testés localement (`auth-service`, `api-gateway`, `passwords-service`, `admin-service`) ✅. Workflow yaml validé. Voir **[docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md § 9](docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.
- [x] **WebAuthn / passkeys (Phase W1 backend, Q17=A)** : 4 endpoints `/auth/webauthn/{register,login}/{begin,finish}` câblés (lib `go-webauthn/webauthn v0.17.3`). Migration `37-webauthn-credentials.sql` (FK `users(id)`, unique global `credential_id`). Challenges en Redis (TTL 5 min, usage unique). Replay protection via `sign_count` strictement croissant. Tests unitaires : config defaults, JWT admin gate (EdDSA accepté / role user rejeté / bearer manquant rejeté), boot avec config invalide. Gateway : `/auth/webauthn/login/*` en public, `register/*` protégé Bearer admin. Variables `WEBAUTHN_RP_ID/NAME/ORIGINS`.
- [x] **WebAuthn Phase W2 frontend** : module `webauthn.ts` (encodage base64url, reviveCreationOpts/reviveRequestOpts, attestationToJSON / assertionToJSON, listPasskeys/registerPasskey/loginWithPasskey/deletePasskey). Page `/4dm1n/passkeys` avec liste + ajout + suppression (React Query + toast + lucide Key/Trash2). Bouton "Se connecter avec une passkey" sur `LoginPage` (visible uniquement si `isWebAuthnSupported()`). Backend : nouveaux endpoints `GET /auth/webauthn/credentials` + `DELETE /auth/webauthn/credentials/:id` (suppression scoppée user_id). Tests Vitest 246 ✅, build Vite OK, ESLint OK, Go ✅. **E2E Playwright** : `e2e/webauthn.spec.ts` + fixture CDP `WebAuthn.addVirtualAuthenticator` ; cible **`make test-e2e-playwright-webauthn`**. **Reste W3+** : mobile Credential Manager / ASAuthorization, quotas par user avant ouverture hors admin.
- [x] **Sidecar `cert-renewer` (rotation auto)** : nouveau service dans `docker-compose.security.yml` qui boucle `step ca renew --expires-in 6h` toutes les 10 min sur tous les certs `infrastructure/step-ca/issued/<svc>/`. Démarré automatiquement par `make mtls-up`. **Pas de mot de passe CA** sur disque : `step ca renew` s'authentifie avec le cert+clé existants. Cibles `make cert-renewer-status` / `cert-renewer-restart`. Renew effectif vérifié manuellement (avant 19:41 → après 19:42 sur cert `api-gateway`). Voir **[docs/securite/MTLS-INTERNE.md § 3.4](docs/securite/MTLS-INTERNE.md)**.
- [ ] **Postgres `sslmode=verify-full`** + cert client par service (`auth_app`, `pass_app`, …) après stabilisation `verify-ca`.
- [ ] **Redis `--tls-auth-clients yes`** + cert client par service (go-redis `TLSConfig` + cert client) une fois chaque consommateur Redis migré.
- [ ] **Prod / reverse proxy** : confirmer qu’aucune couche ne **strip** `Cache-Control`, CSP, HSTS — **REVERSE-PROXY.md** ; WAF / rate limit **par IP** en complément du gateway.
- [x] **Remédiation dépendances front (suite `make test-security`)** : lot `admin-dashboard` traité (MAJ contrôlées tooling + dépendances). **`xlsx` retiré** au profit de `read-excel-file` / `write-excel-file` dans l’éditeur Office ; revalidation Vitest/Playwright OK, audit npm dashboard à 0 vulnérabilité.
- [x] **Qualification/remédiation `govulncheck` (services Go)** : standardisation du scan sécurité sur toolchain patchée (`golang:1.25.9-alpine`) + MAJ `golang.org/x/net` sur `photos-service` + alignement des images Go dev (`1.25`) ; `make test-security` vert côté govulncheck.
- [ ] **Phase 1** : versioning Drive + corbeille unifiée (si pas déjà complet côté produit) ; politique **snapshots** à trancher.
- [ ] **Signatures applicatives** : spec canonical request + nonces pour **exports**, **admin critique**, webhooks ; pas sur toute l’API.
- [ ] **Zero Trust incrémental** : scopes JWT par route ; mTLS ou tokens service inter-microservices documentés.
- [ ] **WAF** : eval NGINX + ModSecurity + CRS (mode détection) devant gateway ; tuning faux positifs.
- [ ] **Audit log** utilisateur / admin (actions sensibles) — lié **SECURITE-DONNEES.md** moyen terme.

### Crypto / perf — chantiers à valider (cf. **[docs/securite/CRYPTO-NORME.md](docs/securite/CRYPTO-NORME.md)** § 9)

- [x] **JWT EdDSA Phase A+B (Ed25519)** : `auth-service` signe TOUS les nouveaux access tokens en EdDSA avec `kid="ed25519-1"` (header). `api-gateway` accepte EdDSA (clé courante) ET RS256 (clé legacy, `kid="rs256-1"` ou absent) via `selectKeyForToken` qui vérifie aussi l'alg-mismatch (refus du downgrade). Tests : `auth-service` 4 nouveaux + `api-gateway` 5 nouveaux. Cf. CRYPTO-NORME.md § 5.2.
- [ ] **JWT EdDSA Phase C — décommissionnement RS256** (à faire ≥ 2026-06-12) : après 30j d'expiration des refresh tokens existants, supprimer la paire RSA d'`auth-service` et la branche `jwt.SigningMethodRSA` de `parseAccessToken` / `selectKeyForToken`. Bumper `auth-service` major version (breaking pour les clients qui auraient mis en cache un kid="rs256-1").
- [ ] **WebAuthn / passkeys** : ajouter en facteur d'authentification au-delà du TOTP, pour `/4dm1n` web et `mobile/admin`. Plan par phases : **[docs/securite/WEBAUTHN-PLAN.md](docs/securite/WEBAUTHN-PLAN.md)** (Q17=A). Lib Go cible : `go-webauthn/webauthn`.
- [ ] **HTTP/3 (QUIC)** : activer côté reverse-proxy en prod (Caddy 2.6+ ou nginx 1.25+). Gain : meilleure latence sur réseaux mobiles / dégradés. Question : Q18.
- [ ] **Hybride post-quantique TLS public** (`X25519MLKEM768`) : activer côté reverse-proxy dès que la chaîne le permet (Caddy 2.8+ ou nginx + OpenSSL 3.5+). Conforme à SECURITE.md § 8 et CRYPTO-NORME.md § 1.5. Question : Q19.
- [ ] **Brotli statiques** : activer compression Brotli niveau 5 sur HTML/CSS/JS côté reverse-proxy ; conserver gzip fallback. Pas sur les réponses API mêlant secrets+données utilisateur (CRIME / BREACH).
- [x] **gosec** en CI : intégré à `make test-security` (scan des modules Go listés ; **warnings** par défaut ; `GOSEC_BLOCKING=1` pour fail le build). Rapports : `reports/gosec-<service>.txt`. Q20=A.
- [ ] **Recalibrage Argon2id** : tâche récurrente tous les 18-24 mois (cf. CRYPTO-NORME.md § 3.4). Prochaine revue prévue **2027-11**.

### Déploiement VPS public / Portainer / NPM (cf. **[docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** — bloqué par H1 homelab Q15=A)

> Cible générique : un VPS Portainer + une instance NPM partagée hébergent déjà plusieurs applications. Cloudity vient s'y greffer en réutilisant le bridge `external: true` (Q22=A → `<EDGE_NETWORK>`) déjà branché à NPM. Les valeurs concrètes (TLD, hostname NPM, owner registry, noms des autres apps) sont **hors Git** : Portainer Stack Variables ou `.env.deploy.local` git-ignored — placeholders dans tous les `.md` (cf. **[fiche déploiement § 0](docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**).

- [x] **Q21 / Q22 / Q23 / Q24 actés (2026-05-12)** — Q21=B GHCR, Q22=A réutiliser `<EDGE_NETWORK>`, Q23=A `cloudity.<DOMAIN>` + sous-domaines `api.` / `admin.`, Q24=A GHA matrice livrée. Détails et conséquences concrètes : **[docs/decisions/multi-repo/REPONSES.md](docs/decisions/multi-repo/REPONSES.md) bloc 4**.
- [ ] **Dockerfile.prod** par service (12 fichiers : 11 backends + cloudity-web). Multi-stage, image finale minimale (alpine / distroless). Différent des `Dockerfile.dev` actuels.
- [ ] **`frontend/apps/cloudity-web/nginx.conf`** : config nginx pour servir le bundle SPA (fallback `/index.html` pour le router, headers cache long sur `/assets/*`, cache off sur `/index.html`).
- [ ] **GitHub Actions** `docker-publish.yml` (cf. fiche § 9) avec matrice 12 services + secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (selon Q24=A).
- [ ] **Stacks Portainer** : 8 fichiers Compose (`cloudity-infra`, `cloudity-identity`, `cloudity-mail`, `cloudity-drive`, `cloudity-photos`, `cloudity-pass`, `cloudity-comm`, `cloudity-web`) à versionner dans `infrastructure/portainer/` et tagger ensemble lors d'une release.
- [ ] **NPM** : 3 Proxy Hosts à créer (`api.cloudity.<DOMAIN>`, `app.cloudity.<DOMAIN>`, `admin.cloudity.<DOMAIN>`) avec Force SSL + HSTS + headers durcis (cf. fiche § 8).
- [ ] **DNS `<DOMAIN>`** (selon Q23=A) : ajouter CNAME `cloudity`, `api.cloudity`, `admin.cloudity` → IP du VPS (chez ton registrar, hors Git).
- [x] **Volume `cloudity_auth_keys` persistant (2026-05-12)** : `auth-service` accepte désormais `AUTH_KEYS_DIR` (helper `keyDir()` + `keyPath()`) et écrit/relit les paires `public.pem`/`private.pem` (RSA legacy) + `public_ed25519.pem`/`private_ed25519.pem` (clé courante) dans ce répertoire. `docker-compose.prod.yml` monte le volume nommé `cloudity_auth_keys` à `/var/lib/cloudity/auth-keys` côté `auth-service` (RW) et le même volume en RO côté `api-gateway` avec `JWT_PUBLIC_KEY_PATH` / `JWT_ED25519_PUBLIC_KEY_PATH`. Tests `TestKeyDirOverrideWritesAndReloadsEd25519` / `TestKeyDirOverrideWritesAndReloadsRSA` / `TestKeyPathCreatesDirectory` (suite `auth-service` 2.8 s ✅). À sauvegarder via le runner backup offsite (cf. BACKUP-OFFSITE.md).
- [x] **Smoke test post-deploy (2026-05-12)** : `scripts/ops/smoke-prod.sh` + cible `make smoke-prod`. Vérifie : `GET /health` 200, `GET /auth/validate` 401 sans Bearer, front SPA 200, TLS handshake (proto + cipher), HSTS + `X-Content-Type-Options: nosniff`. Si `SMOKE_USER`/`SMOKE_PASS` fournis : login + `/auth/validate` Bearer + `/mail/me/accounts` + `/drive/nodes/recent` + `/contacts` (200 / 204 / 404 acceptables). Variables : `SMOKE_API_URL`, `SMOKE_APP_URL`, `SMOKE_TIMEOUT`, `SMOKE_VERBOSE`. Aucun secret embarqué.
- [ ] **Procédure rollback** : pour rollback `v0.5.0 → v0.4.x`, mettre à jour `TAG=` dans Portainer et redéployer la stack ciblée. Documenter dans la fiche § 10.

### UX / Suite web (`frontend/apps/cloudity-web`, **`@cloudity/web`**)

- [x] **Mail web — rationalisation actions latérales** : suppression des doublons (`Nouveau`, `Recharger`, `Paramètres Mail`, `Filtres et règles`) quand déjà présents dans `Menu Mail`.
- [x] **Mail web — compose riche** : barre de formatage de base (gras/italique/souligné/listes/lien), transfert en HTML lisible et titre compose explicite.
- [x] **Mail web — programmer l’envoi** : remplacer la popup navigateur par une modale interne date/heure.
- [x] **Gateway — contrôle d’accès admin-only** : verrouiller `/mail/domains*`, `/mail/mailboxes*`, `/mail/aliases*` côté gateway avec tests unitaires.
- [ ] **Mail web — doc & robustesse** : console navigateur (Vite, CSS mail HTML, favicons) et **dates liste corbeille** — voir **`docs/operations/PLAN.md`** ; sync **`date_at`** sans `time.Now()` si enveloppe IMAP sans date (**mail-directory-service**). **Livré** : sync auto anti-rafale (batch unique, anti-chevauchement, pause onglet caché) + indicateur sidebar. Alias boîte **MVP** ; système **complet** (expiration, vue globale, DNS) : **SYNC-BACKLOG §2**, **STATUS** Phase 3, **ROADMAP APP-04**.
- [x] **Mail web — stabilité React** : correctif **setters / affichage** + **`MailAppChromeMenu`** ; **`make test`** + **`make test-dashboard-one …MailPage.test.tsx`** + **`make test-e2e-playwright-mail`** (écoute console / navigation Mail ↔ Drive). **Optionnel** : garde manuelle longue session / multi-onglets ; réduire bruit **`JWT expired`** sur batch sync (file d’attente côté front).
- [ ] **Mail — règles de tri (type Proton)** : **MVP livré** (CRUD, critères étendus, réconciliation IMAP). **Reste** : tests API / E2E (conditions combinées, application rétroactive scénarisée), polish UX ; tracking **STATUS §0b A3.2**, **SYNC-BACKLOG §0b**.
- [ ] Recherche globale **API** cross-apps (Mail, Pass…) — **Drive** : recherche nom sur **tout l’arborescence** via **`GET /drive/nodes/search`** quand **`?q=`** est renseigné dans le dashboard ; navigation **Contacts** inchangée.
- [ ] Hub : recherche cross-apps (alignée ROADMAP).
- [ ] Playwright : scénario ouverture palette recherche + `?q=` sur Drive (optionnel).

### Observabilité / Performance (TR-06)

- [x] Endpoint admin runtime de base : `GET /admin/performance/overview` (snapshot cgroup + docker stats si disponible) + rendu dashboard admin.
- [x] Dashboard admin : clarification UX du fallback **cgroup seul** quand Docker n’est pas disponible dans le runtime admin-service.
- [ ] CVE admin : enrichir les vulnérabilités OSV quand `summary` est vide (`—`) avec alias GHSA/CVE, sévérité, plages affectées, liens GHSA/NVD/OSV, et version de remédiation si connue.
- [ ] Collecte métriques **par service** (gateway + microservices + front) : latence p50/p95/p99, erreurs, CPU/Mémoire/IO.
- [ ] Historisation métriques + exploration dans l’admin (filtres service/route/période).
- [ ] Traçabilité des exécutions CI/dev (`make test`, E2E, mobile) avec empreinte ressources.
- [ ] Budgets et seuils automatiques (alerte / fail pipeline) pour éviter les régressions CPU/Mémoire/IO.

### Catalogue apps (hors coeur deja suivi)

- [ ] **Gate priorite** : ne lancer ce catalogue qu'apres stabilisation des blocs coeur (Drive/Mail/Photos/Pass), puis Calendar/Notes/Tasks/Contacts.
- [ ] **Vague A (catalogue tardif mais logique)** : Bookmarks/Read later, Wiki/Knowledge Base, Kanban/Boards, Forms/Surveys, Sites/Pages, Journal/Daily log, Habits/Routines, Snippets/Templates, Web clipper, Receipts/Documents perso, RSS/News reader, Scanner documents.
- [ ] **Vague B (apres Vague A)** : PKM/Knowledge graph, Whiteboard/Canvas, PDF annotation, Reference manager, Clipboard sync, File requests/Collect, Vault documents sensibles, Workflow automation transversal, Activity stream global, Universal search, Secure share center, Developer hub, Backup center, Device center, App launcher.
- [ ] **Vague C (long terme, complexite elevee)** : Chat/Team messaging, Meet/Calls, Security/Admin center avance (gouvernance, retention, legal hold), marketplace d'integrations, mini CRM/client portal, no-code tables, home automation, e-signature, assistant IA transversal.

### Mobile

- [x] **Drive** Flutter (`mobile/drive`) : liste fichiers — **`make test-mobile-drive`** / suite — **MOBILES.md**.
- [x] **Photos** Flutter : **`make test-mobile-photos`** / suite.
- [x] **Mail** Flutter (`mobile/mail`) : multi-boîtes, dossiers, lu, **PJ téléchargeable / partage**, **envoi minimal** (`POST /mail/me/send`), tests `mail_validation` — **`make test-mobile-mail`** ; à poursuivre : brouillon **serveur**, PJ inline, push — **MOBILES.md** §5.
- [ ] Aligner barre d’app (loupe, notifications) avec le web — rappel dans **GlobalSearchPalette** (texte d’aide UI).

### Backend / infra

- [x] **contacts-service** : **`main_test.go`** (health, 401 sans `X-User-ID`, liste vide si DB absente) — inclus dans **`make test`** / **`make test-docker`** / **govulncheck** (`scripts/ci/test-security.sh`).
- [x] **Mail + gateway — bruit `make logs`** : SELECT IMAP sur noms absents (multi-fournisseur) sans log `[mail] sync select` ; ordre candidats **archive** (Gmail en dernier) ; **api-gateway** : **context.Canceled** sur reverse proxy sans spam — **SYNC-BACKLOG §0b** (paragraphe logs), **`mail-directory-service/imap_folders.go`**, **`api-gateway/main.go`**.
- [ ] Mail archivage longue durée + full-text — **SYNC-BACKLOG** §1, **ROADMAP APP-01**.

### Qualité & CI

- [ ] **`make test`** systématique sur **Docker** ; **`make test-docker`** après **`make up`** pour valider l’image runtime.
- [x] Couverture **GlobalSearchPalette** (Vitest) : raccourci clavier, navigation — **`GlobalSearchPalette.test.tsx`** (voir **TESTS.md**).

---

## Récemment aligné (référence)

- **Tests** : `make test` 100 % orienté conteneurs (Go `--no-deps`, admin conditionnel, Vitest dashboard).
- **Recherche (MVP)** : composant **`GlobalSearchPalette`** + **7 tests Vitest** ; paramètre **`/app/drive?q=`** ; titre Drive racine en **`sr-only`**.

---

*Fichier créé pour centraliser le backlog racine ; le détail sync reste dans **docs/produit/SYNC-BACKLOG.md**.*
