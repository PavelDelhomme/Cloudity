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

### 2026-07-22 — Env public Portainer + fix admin Dashboard

- Branche : `feat/app-vault-drive-upload-pin-rotation`.
- Env : `CLOUDITY_PUBLIC_*` · `scripts/dev/sync-public-urls.sh` · `env-prepare.sh` · `portainer-env-print.sh` · cibles Make `sync-public-urls` / `env-prod` / `env-preprod` / `portainer-env`.
- Admin : imports Dashboard alignés sur `api.ts` (`fetchBudgetStatus`, …) — Vitest Dashboard 4/4.
- Docs : `.env.example`, `ENV-GENERATION.md`, guide déploiement, `deploy/portainer/*`, `TODOS` / `STATUS` / `BACKLOG` (`DEPLOY-ENV-01` ☑).
- Checks : `make env-prod DOMAIN=cloudity.example FORCE=1` · `npm test` Dashboard ✅.

---

### 2026-06-10 — Photos H8/H9 + UX sélection + persistance Mail

- Branche : `feat/app-hub-photos-ux-hardening` (`77700051`).
- Photos : archive/verrouillé serveur (`43-drive-photos-archive-locked.sql`, `/drive/photos/*`) ; paramètres locaux ; sélection par date, menu contextuel, garde drag interne.
- Mail : restauration dernière boîte (`cloudity_mail_selected_account_id`) + repli email login.
- Docs : `PHOTOS.md`, `TODOS.md`, `STATUS.md`, `TESTS.md`.
- Checks : `go test` drive/photos-service ✅ ; Vitest PhotosPage 16 + MailPage 32 ✅.

---

### 2026-06-09 — App Hub / Drive récents / Photos UX

- Branche : `feat/app-hub-photos-ux-hardening`.
- Drive : correction `GET /drive/nodes/recent` (scan SQL `taken_at/created_at/updated_at`) ; validation réelle `200`, 24 éléments.
- Web : dossier racine `Photos` dans Drive → `/app/photos`; aperçus Photos du Hub → app Photos; dark mode Photos renforcé; `Tout sélectionner` désactivé quand tout est déjà sélectionné.
- Suivi : `TODOS.md` ajoute H8 (archive/verrouillé serveur + actions groupées) et H9 (paramètres par application web).
- Checks : `go test ./...` drive-service ✅ ; Vitest Hub/Photos/Drive ✅ ; lints ciblés ✅.

---

### 2026-06-09 — gosec vert + U9 2FA admin + audit mobile H6c

- **gosec** : `.gosec.json` + corrections gateway/mail/drive ; `GOSEC_BLOCKING=1` vert sur tous services → merge `dev` (`e7b83759`).
- **U9** : `POST /admin/users/:id/2fa/reset` step-up TOTP + `audit_logs` + UI Users → merge `dev` (`ad8cd270`).
- **H6c** : `MOBILE-SECURITY-CHECKLIST.md` ; logout purge broker (Photos/Drive/Mail) ; `INTERNET` release Drive/Pass ; `admin_app` LogInterceptor debug-only.

---

### 2026-06-09 — Merge security-audit → dev + branches suite

- Git : push `feat/security-audit-hardening` · fast-forward merge **`dev`** @ `7ead7da9` · push `origin/dev`.
- Branches créées : `feat/security-gosec-hardening` (active), `feat/admin-u9-2fa-advanced`, `feat/security-mobile-audit`.
- Début gosec : `.gosec.json` baseline + `docs/securite/GOSEC.md` + `test-security.sh` `-conf`.

---

### 2026-06-08 — Auth web admin (HMR + refresh 401) + baseline gitleaks

- Branche : `feat/security-audit-hardening`.
- Web : `authContextStore.ts`, `authSessionRefresh.ts` (Web Locks cross-onglets), `AuthProvider` racine `AdminApp`/`App` ; tests Vitest auth ✅.
- Sécurité : `.gitleaks.toml` + `test-security.sh` / `Makefile` ; historique git 0 fuite.
- Docs : `TODOS.md`, `STATUS.md`, `SECRETS.md` mis à jour.
- Checks : `npm test` auth (16) ✅ · `make secrets-scan` ✅ · gateway `/health` 200.

---

### 2026-05-21 — UI-3 Pass/Settings + validation mobile appareil

- Branche : `feat/photos-gallery-mobile-sync-security`.
- UI-3 : imports `@cloudity/ui` sur Pass (7 fichiers) + Settings (`ResponsivePage` sur `AppSettingsPage`).
- Mobile : `workmanager` 0.9.x (fix build Android) · `adb reverse` auto pour téléphones USB dans `mobile-test-common.inc.sh`.
- Checks : `PassPage.test.tsx` ✅ · `CLOUDITY_DEVICE_ID=R5CT7263YJL make test-mobile-suite` ✅ · `make test-mobile-2fa` ✅.

---

### 2026-05-21 — Git sync branches + Photos WorkManager (galerie Android)

- Branche : `feat/photos-gallery-mobile-sync-security` (active).
- Git : push `feat/mobile-desktop-validation` · fast-forward **`dev`** · merge **`dev`** dans toutes les branches `feat/*` locales (sauf `main`) · HEAD commun `1ae4e708`.
- Mobile Photos : sauvegarde galerie Android (`workmanager`, `photo_manager`, `drive_api`, feuille réglages timeline).
- Checks : `flutter test` Photos ✅ (prefs + widget).
- Suite : UI-3, U9/U10, Safari extension.

---

### 2026-05-21 — Hors mail prod : Firefox Pass, icônes, Photos albums

- Branche : `feat/mobile-desktop-validation`.
- Pass : icônes PNG (`scripts/sync-icons.mjs`) · `extensions/cloudity-pass-firefox/` + `make build-pass-extension-firefox`.
- Photos web : bouton « Nouvel album », exclusion dossier bibliothèque `Photos` de la grille albums, Vitest.
- `TODOS.md` : distinction **mail prod (pause)** vs **hors mail prod (priorité)**.
- Checks : `make test-pass-extension` ✅ · `make build-pass-extension-firefox` ✅ · `make test-dashboard-one FILE=src/pages/app/photos/PhotosPage.test.tsx` ✅.

---

### 2026-05-21 — Pass extension : popup L3 (liste onglet actif)

- Branche : `feat/mobile-desktop-validation`.
- Extension : popup déverrouillée — entrées login filtrées par domaine de l’onglet actif, recherche locale, copie identifiant/mot de passe, bouton « Remplir l’onglet » (`fill-active-tab` → `fill-login` content script). Permission `tabs`, version `0.2.1`.
- Checks : `make test-pass-extension` ✅ (domain matcher + build MV3).
- Docs : `BACKLOG.md`, `TODOS.md`, `STATUS.md`.

---

### 2026-05-21 — MP-04 : Linux desktop Drive/Photos validé

- Branche : `feat/mobile-desktop-validation`.
- Mobile/desktop : ajout `make test-mobile-desktop-linux` (`scripts/mobile/test-mobile-desktop-linux.sh`) pour valider `mobile/drive` et `mobile/photos`.
- Correctif : CMake Linux Drive/Photos conserve `-Werror` mais ajoute `-Wno-error=deprecated-literal-operator` pour le `json.hpp` de `flutter_secure_storage_linux` avec Clang/Arch récents.
- Checks : `make test-mobile-desktop-linux` ✅ (`flutter test` + `flutter build linux --debug` pour Drive et Photos).
- Docs : `BACKLOG.md` MP-04 ☑, `docs/operations/TESTS.md`, `docs/produit/MULTI-PLATEFORME.md`, `TODOS.md`, `STATUS.md`.

---

### 2026-05-21 — Pause Mail et bascule hors déploiement

- Branche : `feat/mail-mta-alias-delivery` fusionnée dans `dev` (`04a9c68c`), puis nouvelle branche `feat/mobile-desktop-validation`.
- Consigne utilisateur notée : ne pas reprendre Mail alias / Maddy / Portainer / C7 tant que l’utilisateur ne dit pas explicitement **« on retourne sur la partie mail »**.
- Suite de travail : Photos, mobile, frontend, applications, Pass ; première cible pressentie : validation Linux desktop Drive/Photos (BACKLOG MP-04).
- Docs : `TODOS.md`, `STATUS.md`, `docs/LOGS.md`.

---

### 2026-05-21 — Mail web : notifications système activables

- Branche : `feat/mail-mta-alias-delivery`.
- Front web : ajout `MailNotificationsSection` dans `/app/settings` pour activer/désactiver/tester les notifications système Mail sur l’ordinateur courant.
- Notifications : factorisation `mailDesktopNotifications.ts` ; les notifications Mail existantes (page Mail + watcher global) respectent maintenant ce réglage local.
- Check : `make test-dashboard-lint` ✅.

---

### 2026-05-21 — Maddy alias-router : routage local/prod réel

- Branche : `feat/mail-mta-alias-delivery` depuis `dev` après fusion de `feat/mail-alias-prod` (`dev` poussé à `0a31874a`).
- MTA : ajout `deploy/mail-mta/alias-router` (Go) ; Maddy livre vers `alias-router:2527` via target SMTP nommé, plus de `deliver_to dummy`.
- Compose : `docker-compose.local.yml` et `docker-compose.maddy.yml` démarrent `alias-router` + Maddy ; env `RELAY_SMTP_*` ajouté aux exemples Portainer/local.
- Docs : `deploy/mail-mta/README.md`, `MAIL-MTA-LOCAL-TEST.md`, `PORTAINER-MAIL-ALIAS.md`, `TODOS.md`, `STATUS.md`.
- Checks : `GOWORK=off go test ./...` (`alias-router`) ✅ ; compose config local/prod avec exemples ✅ ; `make mail-mta-local-up` ✅ ; `make test-mail-mta-local` ✅ (alias absent : 404 API + 550 SMTP attendu).

---

### 2026-05-21 — MTA prod : make targets + admin DNS copiable

- Branche : `feat/mail-alias-prod`.
- Scripts : `sync-mail-mta-env.sh`, `test-mail-mta-local.sh` ; Makefile `sync-mail-mta-env`, `test-mail-mta-local`, `mail-mta-local-up|down|logs`.
- Admin `/4dm1n/domaines` : bloc enregistrements DNS (MX/SPF/DKIM/DMARC) avec boutons Copier pour domaines rôle alias.
- Docs : `MAIL-MTA-LOCAL-TEST.md`, `deploy/mail-mta/README.md`, `TODOS.md` #6 🟡.
- Checks : `make test-mail-mta-local` ✅ health + Maddy:2526 ; `make test-go-one SERVICE=mail-directory-service` ✅.

---

### 2026-05-21 — Git : fusion feat/mail-alias-checklist → dev, branche prod

- Branche : `feat/mail-alias-checklist` → **`dev`** (fast-forward `946611c4..00a0474c`, 9 commits) ; nouvelle branche **`feat/mail-alias-prod`** depuis `dev`.
- Remote : `git push origin dev` ✅ ; `git push -u origin feat/mail-alias-prod` ✅.
- Docs : `TODOS.md`, `STATUS.md` — chantier actif = DNS/Maddy prod + C7 réel (§ ENSUITE #6–#7).
- Liens : [GIT.md](GIT.md), [operations/BRANCHES.md](operations/BRANCHES.md).

---

### 2026-05-21 — Pass extension MP-07 : E2E Chromium autofill

- Branche : `feat/mail-alias-checklist`.
- Extension : ajout `e2e/pass-extension.spec.ts`, cible `make test-e2e-playwright-pass-extension`, chargement Chromium avec `--load-extension=extensions/cloudity-pass/dist`.
- Scénario : création d’une entrée Pass via l’UI web, déverrouillage extension, candidat domaine dans le menu content-script, puis autofill username/password après clic utilisateur.
- Correctifs réels découverts par le test : manifest généré sans références d’icônes absentes (sinon Chromium refuse l’extension) ; CSP extension avec `connect-src`; gateway CORS autorise les origines `chrome-extension://…` en dev (`CORS_ALLOW_LAN=true`).
- Checks : `go test ./...` dans `backend/api-gateway` ✅ ; `make deploy-gateway` ✅ local ; `make test-e2e-playwright-pass-extension` ✅.

---

### 2026-05-21 — Tests réalistes 2FA/Mail alias : cas négatifs et C6

- Branche : `feat/mail-alias-checklist`.
- 2FA web : `e2e/twofa.spec.ts` étendu à 5 scénarios — activation TOTP, login TOTP, mauvais code refusé puis TOTP valide, recovery code, recovery code consommé refusé.
- 2FA mobile : Drive/Mail/Photos testent désormais mauvais code puis code TOTP valide ; le TOTP est calculé côté Flutter au moment de la saisie avec le secret de test pour éviter l’expiration pendant le build Android.
- Mail alias C6 : Vitest `MailPage` + Playwright Mail vérifient le composer `De` avec alias actif, exclusion alias désactivé, et POST `/mail/me/send` avec `from_email`.
- Checks : `command npx vitest run src/pages/app/mail/MailPage.test.tsx --reporter=verbose` ✅ (30/30), `make test-e2e-playwright-mail` ✅ (9/9), `make test-e2e-playwright-twofa` ✅ (5/5), `make test-pass-extension` ✅, `make test-mobile-2fa` ✅ sur Samsung `R5CT7263YJL` (Drive/Mail/Photos).

---

### 2026-05-21 — Mail alias local : création, résolution MTA et smoke SMTP

- Branche : `feat/mail-alias-checklist`.
- Alias local : création d’un alias `e2e-alias-*` sur une boîte admin existante, vérification liste + règle auto (`recipient_pattern`) + résolution `/mail/internal/alias-resolve`.
- On/off alias : `PATCH enabled=false` → résolution MTA 404 ; `enabled=true` → résolution 200.
- Maddy local : `deploy/mail-mta/maddy/maddy.conf` corrigé pour Maddy 0.9.4 (syntaxe `{env:...}`, `hostname`, suppression des directives invalides `table.local_relay`, `target.pipe`, `queue`; smoke local `deliver_to dummy`). Port `2525` occupé par MailHog, test réalisé sur `2526`.
- SMTP smoke : `swaks --quit-after RCPT` vers l’alias → RCPT accepté (`250`). Livraison IMAP réelle/redirection fournisseur non rejouée en local contrôlé.

---

### 2026-05-21 — Admin 2FA réinitialisée + MP-06 autofill initial

- Branche : `feat/mail-alias-checklist`.
- Sécurité locale : 2FA désactivée sur `admin@cloudity.local` via `scripts/dev/reset-user-2fa.sh`; les codes de récupération/secret TOTP collés dans le chat sont considérés exposés et invalidés (non consignés dans le dépôt). Vérif login : `requires_2fa=false`, access token présent.
- Extension Pass : MP-06 initial — service worker récupère `/pass/vaults` + `/pass/vaults/:id/items`, déchiffre `EnvelopeV1` avec `@cloudity/pass-crypto`, filtre par domaine (`hostMatchesEntry`) et renvoie les candidats au content script.
- UX autofill : badge Cloudity cliquable → menu d’entrées candidates → remplissage username/password uniquement après clic utilisateur.
- Checks : `make test-pass-extension` ✅ (test domain matcher + build MV3). Avertissement attendu : icônes extension manquantes.

---

### 2026-05-21 — Batterie locale « vie réelle » + 2FA mobile Samsung (ADB)

- Appareil : Samsung `R5CT7263YJL` (SM-G990B2), gateway auto `http://192.168.1.134:6080`.
- **2FA mobile** : `scripts/dev/prepare-e2e-2fa-mobile.sh`, `scripts/mobile/test-mobile-2fa.sh`, `integration_test/twofa_flow_test.dart` (Drive/Mail/Photos) — login mot de passe → écran 2FA → TOTP → écran principal. **3/3 OK**.
- **Mail** : `SessionStore.gatewayCandidates()` prend `CLOUDITY_E2E_GATEWAY` ; tests Mail sans champ gateway (auto-détection).
- **Suite standard mobile** : `make test-mobile-suite` — Photos + Drive + Mail (admin, pas 2FA) **OK** sur le même téléphone.
- **Web** : `make test` (306 Vitest), `make test-e2e`, `make test-e2e-playwright` (**75 passed**, 4 skipped, inclut `twofa.spec.ts`), `make test-pass-extension`, `make test-e2e-playwright-twofa`.
- Cible agrégée : `make test-local-realistic` (seed + pass + 2FA web + mobile suite + mobile 2FA).

---

### 2026-05-21 — 2FA web : activation Settings + E2E dédié

- Branche : `feat/mail-alias-checklist`.
- UI : `TwoFactorSection.tsx` (QR otpauth, secret, vérification TOTP, affichage codes récup) branché sur `AppSettingsPage`.
- Dev/E2E : `make seed-e2e-2fa`, `make reset-e2e-2fa`, `scripts/dev/reset-user-2fa.sh`, `e2e/twofa.spec.ts` + `e2e/fixtures/twofa.ts`, cible `make test-e2e-playwright-twofa` — **3 passed**.
- Compte isolé : `e2e-2fa@cloudity.local` / `E2faTest123!` (ne pas activer 2FA sur `admin@cloudity.local`).

---

### 2026-05-21 — Suivi : validation 2FA locale à prioriser

- Branche : `feat/mail-alias-checklist`.
- Décision : la 2FA doit être testable en local, pas seulement prévue pour la prod, car elle conditionne la connexion web et mobile de toute la suite.
- Suivi : `TODOS.md` — ajout **ENSUITE #5b** et **Q8 / 2FA locale** : activation TOTP, codes de récupération, login web étape 2, code de récupération, E2E dédié, validation mobile avec ADB.
- Attention E2E : ne pas laisser `admin@cloudity.local` dans un état 2FA permanent qui casse les tests standards ; préférer un utilisateur dédié ou un reset contrôlé.

---

### 2026-05-21 — Barrière qualité pré-déploiement : tests complets et E2E stabilisés

- Branche : `feat/mail-alias-checklist`.
- Makefile/tests : ajout `test-pass-extension` et inclusion du build/test MV3 dans le socle Pass ; correction `scripts/ci/test-security.sh` pour monter `backend/internalsec` dans les scans Go Docker.
- E2E : stabilisation login Playwright avec bouton submit exact + `returnTo`, correction sélecteurs Pass/Mail, nettoyage quota passkeys avant test WebAuthn.
- Checks verts : `make test-pass-extension`, `make test-pass`, `make test`, `make test-dashboard-lint`, `make test-e2e`, `make test-e2e-playwright`, `make test-mobile-suite` (hôte Photos/Drive/Mail ; integration_test ignorés faute ADB).
- Checks orange : `make test-security` termine avec warnings (npm modéré, Go stdlib/toolchain, `gosec`, `gitleaks`) ; `make perf-budgets` KO sur `LOADAVG_1M=8.18 > 6.0` après grosse batterie, conteneurs OK.

---

### 2026-05-21 — Pass extension MP-06 : domain matcher local

- Branche : `feat/mail-alias-checklist` (suite hors déploiement demandée ; VPS/DNS mail laissé de côté).
- Code : `extensions/cloudity-pass/src/shared/domainMatcher.ts` ajoute normalisation hôte, domaine enregistrable et matching strict ; le content script affiche le domaine candidat détecté dans le badge Cloudity.
- Tests : `extensions/cloudity-pass` — `command npm test` ✅ ; `command npm run build` ✅ (avertissement connu : icônes manquantes du squelette).
- Suivi : `TODOS.md` note la régénération des secrets locaux avant VPS/prod ; `STATUS.md` recentre la suite sur J8 Pass / MP-06 sans déploiement.

---

### 2026-05-21 — MTA alias local : fallback `.env` dev

- Branche : `feat/mail-alias-checklist`.
- Config : `MAIL_ALIAS_DOMAIN` est accepté comme suffixe alias en dev si `MAIL_ALIAS_SUBDOMAIN` est vide ; `MAIL_ALIAS_PORT=2525` documenté pour la stack locale.
- Outils : ajout `make ensure-mta-internal-token` et intégration dans `make doctor` / `stack-heal`.
- Docs : `MAIL-ALIAS-MTA.md`, `MAIL-MTA-LOCAL-TEST.md`, `ENV-GENERATION.md`, `DEPLOIEMENT-SUIVI.md`.

---

### 2026-05-20 — Admin Domaines : configuration MTA/DNS

- Branche : `feat/mail-alias-checklist`.
- DB/API : migration `41-mail-domain-mta-config.sql` ; `mail_domains` suit rôle domaine, MTA activé, hostname, MX, SPF, DKIM, DMARC.
- Front admin : `/4dm1n/domaines` permet d’éditer la configuration MTA/DNS attendue sans exposer secrets/IP/clés privées.
- Docs : ajout `MAIL-ALIAS-MTA.md` et rappel que `MAIL_ALIAS_SUBDOMAIN` + `MTA_INTERNAL_TOKEN` doivent être décommentés localement.

---

### 2026-05-20 — MTA alias auto-hébergé (MAIL-ALIAS-05 partiel)

- Branche : `feat/mail-alias-checklist`.
- Backend : `POST /mail/internal/alias-resolve` (token `MTA_INTERNAL_TOKEN`) ; filtre `delivered_to` étendu à `raw_headers` (Delivered-To, X-Original-To).
- Infra : `deploy/mail-mta` — `docker-compose.local.yml`, `maddy.conf`, `alias-deliver.sh`, `.env.local.example`.
- Doc : TODOS, STATUS, BACKLOG, MAIL-ALIAS-RECEPTION, MAIL-ALIAS-DNS-MADDY, MAIL-MTA-LOCAL-TEST, PORTAINER.
- Tests : `go test` mail-directory-service OK.

---

### 2026-05-20 — Mail/alias : cadrage phase 2 domaine dédié

- Branche : `feat/mail-alias-checklist`.
- Décision : travailler avec un domaine alias dédié en conditions proches prod, mais via **redirection fournisseur** uniquement.
- Sécurité : ne pas changer les MX, ne pas committer le vrai FQDN/IP ; configurer le suffixe réel dans l’UI ou chez le registrar.
- Docs : **TODOS**, **STATUS**, **BACKLOG**, **MAIL-ALIAS-CHECKLIST**, **MAIL-ALIAS-REDIRECTION-SAFE** recentrés sur la phase 2.

---

### 2026-05-20 — Mail/alias : stack validée + tests Paramètres Mail

- Branche : `feat/mail-alias-checklist`.
- Utilisateur : `make doctor` · `make migrate` · `make test` (304 tests) · `make deploy-mail` — OK.
- Code : tests Vitest création/désactivation alias via **Paramètres Mail** ; checklist § 2 cochée.
- Suite : validation manuelle **C1–C7** (sync IMAP, toast, filtre latéral, règle « Alias · … », From, C7 si redirection A1).

---

### 2026-05-20 — Mail/alias : branche checklist + tests filtre

- Branche : `feat/mail-alias-checklist` (depuis `dev` à jour après merge UI-DS).
- Git : `feat/cloudity-ui-design-system` → `dev` (fast-forward) ; push `dev` + création/push `feat/mail-alias-checklist`.
- Tests : `MailPage` — clic alias → `fetchMailMessages` avec `delivered_to` ; `PassMailAliasesPanel` — création alias avec suffixe.
- Doc : **TODOS** / **STATUS** recentrés ENSUITE #3–#4 ; **MAIL-ALIAS-CHECKLIST** C1 note Pass OK / Mail à rejouer.
- Suite manuelle : cases **C2–C7** + **MAIL-ALIAS-REDIRECTION-SAFE** (A1/A2).

---

### 2026-05-20 — Git : fusion UI-DS dans `dev` + branche mail/alias

- Branche source : `feat/cloudity-ui-design-system` → `dev` (fast-forward).
- Contenu : package `@cloudity/ui`, admin responsive, polish admin, correctifs Mail recherche/conversations.
- Prochaine branche : `feat/mail-alias-checklist` — **TODOS** § ENSUITE #3–#4.
- Reporté : **U9** (2FA admin), **U10** (CVE enrichies).

---

### 2026-05-20 — Suivi : CVE admin à enrichir

- Branche : `feat/cloudity-ui-design-system`.
- Constat utilisateur : l’analyse CVE affiche encore trop de lignes avec résumé `—` (ex. `golang.org/x/crypto`, `golang.org/x/net`, `grpc`, `python-multipart`) et pas assez d’informations actionnables.
- Suivi : `TODOS.md` — ajout `U10 CVE enrichies`; `BACKLOG.md` — tâche TR-06/CVE pour afficher alias, sévérité, impact, affected ranges et version de remédiation quand OSV/GHSA/NVD les exposent.

---

### 2026-05-20 — Admin : polish exploitation, sécurité et CVE

- Branche : `feat/cloudity-ui-design-system`.
- **Domaines mail** : helpers API durcis contre les réponses liste `null` (`domains`, `mailboxes`, `aliases`) ; page Domaines enrichie avec états vides/erreurs de détail et formulaires responsive.
- **Users / 2FA** : dernière connexion rendue explicitement (`Jamais enregistrée`) ; statut actif pilotable ; note sécurité indiquant que le reset 2FA admin doit passer par step-up + audit, pas par un toggle.
- **Dashboard / CVE / Passkeys / Settings** : dashboard explique le fallback cgroup sans Docker ; CVE ajoute priorités par paquet et synthèse écosystème ; passkeys affiche quota, fallback de nom et périmètre web vs mobile/extension ; settings ajoute raccourcis sécurité/exploitation.
- **Suivi** : `TODOS.md` — ajout `U8` coché et `U9` pour la gestion 2FA admin avancée.

---

### 2026-05-20 — UI-DS : responsive Admin, catalogue et Mail mobile

- Branche : `feat/cloudity-ui-design-system`.
- **@cloudity/ui** : `ResponsiveShell`, `ResponsivePage`, `ResponsiveGrid`, `ResponsivePanel`, `ResponsiveToolbar`, `ResponsiveStack`, `ResponsiveSplitView` exportés ; `ResponsiveShell` accepte `pathname`, `renderNavLink`, `brandLink`.
- **Admin** : `AdminLayout.tsx` — drawer &lt;lg via `ResponsiveShell` + `Link` React Router ; `UiCatalogPage.tsx` — grille responsive.
- **Mail** : pile `nav → liste → lecture` sous 1024px, barre Retour/Dossiers, raccourcis et actions ligne masqués, split liste/aperçu à partir de `lg`.
- **Tests** : `MailPage.test.tsx` (26), `uiCatalog.smoke.test.tsx` ; garde `matchMedia` pour jsdom.
- **Suivi** : `TODOS.md` — `U7` coché.

---

### 2026-05-20 — UI-DS : audit responsive multi-écrans

- Branche : `feat/cloudity-ui-design-system`.
- **Audit code** : `@cloudity/ui` couvre les primitives et `PageLayout`, mais les règles responsive restent surtout dans `AppLayout`, `AdminLayout` et les pages métier.
- **Validation navigateur** : test rapide Mail + catalogue UI à largeur smartphone (`375×667`) et tablette (`768×1024`) ; l’app shell a une base mobile, mais Mail est trop dense en petit écran et l’admin/catalogue garde une sidebar fixe non mobile-first.
- **Doc** : **`docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md`** — ajout des formats cibles (smartphones, tablettes, laptop, grand écran/2K), règles UI et critères de sortie.
- **Suivi** : **`TODOS.md`** — ajout `U7 Responsive UI-DS` pour traiter Mail mobile, Admin shell et catalogue responsive.

---

### 2026-05-20 — Mail : validation message impôts IMAP

- Branche : `feat/cloudity-ui-design-system`.
- **Validation navigateur** : connexion locale `admin@cloudity.local`, Mail → compte `dumb@delhomme.ovh` → ouverture du message **« Avis d’impôt sur les revenus 2025 – cette année, vous ne recevrez plus de papier ! »**.
- **Résultat** : le message était présent en base avec corps vide (`plain_len=0`, `html_len=0`) puis le parcours de lecture a rechargé le corps IMAP (`plain_len=1110`, `html_len=22655`) et affiché le contenu.
- **Filtres vérifiés** : `from: jobbingtrack` avec espace retourne bien les expéditeurs JobbingTrack ; `Actu` / `impots` ne retournaient rien tant que le mauvais compte (`test@delhomme.ovh`) était actif, puis les messages impôts apparaissent sur `dumb@delhomme.ovh`.
- **Suivi** : **`TODOS.md`** — ENSUITE #2 coché ; **`STATUS.md`** — priorités recentrées sur ENSUITE #3–#4.

---

### 2026-05-20 — Mail : filtres rapides `from:` / `subject:` / `tag:`

- Branche : `feat/cloudity-ui-design-system`.
- **Frontend** : **`MailPage.tsx`** — les opérateurs insérés par les boutons rapides acceptent désormais la saisie avec espace (`from: paveldelhomme`, `subject: actu`, `tag: important`) et déclenchent aussi une recherche serveur quand utile.
- **Tests** : **`MailPage.test.tsx`** — couverture des opérateurs avec espace + combinaison `from:` / `subject:` / `tag:`, en plus des filtres `has:attachment` et `is:unread` déjà couverts.
- **Checks** : `make test-dashboard-one FILE=src/pages/app/mail/MailPage.test.tsx` ✅ (25 tests).

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
