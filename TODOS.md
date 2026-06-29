# CLOUDITY — Suivi court (micro-tâches)

**Rôle** : cases rapides et liens ; le détail produit reste dans **[BACKLOG.md](./BACKLOG.md)**, le fil quotidien dans **[STATUS.md](./STATUS.md)**.

> **Point d’entrée unique** : **Mail prod** (OVH, DNS, VPS, Portainer stack `cloudity-mail-mta`, secrets prod, C7 réel) est **en pause** jusqu’à **« on retourne sur la partie mail »**.  
> **Hors mail prod** = tout le reste : Pass, Photos, Drive, mobile/desktop, UI, tests locaux — y compris **Mail en local** (`make up`, Vitest, Maddy docker) si besoin de régression, **sans** configurer OVH ni le VPS.

**Branche active** : **`feat/app-vault-drive-upload-pin-rotation`** — quota, Photos/Drive vault, matching mobile.

### Session 2026-06-22 — UX dev & Paramètres

| Sujet | État | Détail |
|-------|------|--------|
| **`make logs`** | ☑ | Historique (`--tail`) même stack down + suivi live ; `CLOUDITY_LOGS_HIDE_HEALTH=1` masque les sondes Docker `/health` |
| **Capture logs tests** | ☑ | `scripts/ci/test-log-capture.inc.sh` — chaque `make test*` / `make tests` → `reports/test-logs/<run-id>/` (redaction JWT/mots de passe, chmod 600) |
| **`make perf-benchmark`** | ☑ | ~20 scénarios CPU/MEM/IO conteneurs → `reports/perf/benchmark-*/REPORT.md` ; `make perf-benchmark-quick` |
| **Sync mail doublons** | ☑ | Mutex backend + dedup frontend GlobalMailSyncWatcher ; Postgres tx pour persist password |
| **`make up-full` / tests** | ☑ | Rapport `reports/test-logs/<id>/REPORT.md` ; `make test-report-show RUN_ID=<id>` ; exit code réel via `pipefail` |
| **Matrice tests complète** | ☐ | Audit manuel : unitaires Go/Python/Vitest, E2E Playwright, mobile Flutter, perf (`make perf-benchmark*`), sécurité, infra — voir § **QA-MATRIX** ci-dessous |
| **Postgres FATAL pendant sync Mail** | 🟡 | `could not send data to client` + `connection to client lost` en rafale avec `POST /mail/me/accounts/*/sync` — souvent bénin (fermeture conn pool / sync parallèle) ; voir § **Logs Postgres × Mail** ci-dessous |
| **Récap signaux logs** | ☑ | `make test-report` / `test-report-show` ; auto-rebuild manifest si tronqué (`make test-manifest-rebuild`) |
| **Ports hôte séquentiels** | ☑ | Série 6001–6012 · `make ports-sequential` · `make check-ports` · **docs/operations/PORTS-HOTES.md** |
| **Validation branche vault/drive** | 🟡 | Checklist manuelle ci-dessous (post `make up-full` OK run `20260622-192608`) |
| **Mail — login = email boîte** | ☑ | Relier une boîte `@cloudity.local` → aligne `users.email` sur l’IMAP (ex. `paul@delhomme.ovh`) ; `SEED_ADMIN_EMAIL` pour seed direct |
| **Mail — Gmail OAuth (UI)** | ☑ | « Continuer avec Google » en premier (modal + état vide) — prérequis admin : `GOOGLE_OAUTH_*` dans `.env` · **docs/produit/MAIL-GMAIL-OAUTH.md** |
| **Mail — mode conversations** | ☑ | Liste toujours groupée par fil (plus de bascule liste plate) |
| **Config compose unifiée** | ☐ | Toute config conteneur via `docker-compose.yml` + overlays (`dev`, `https`, `preprod`, `prod`, `security`, `services`) + `.env` — pas de duplication |
| **Titres d’onglet web** | ☑ | App : `Section — Cloudity — email` ; Admin : `Administration — Cloudity` (+ sous-pages) via `buildAdminDocumentTitle` |
| **2FA Paramètres** | ☑ | Détection via `is_2fa_enabled` API (plus le nombre de codes recovery) ; export `.txt` codes |
| **Notifications Mail** | ☑ | Bouton « Activer » masqué une fois activé |
| **Quota Drive/Photos web** | ☑ | Badge espace dans Drive + Photos + section Paramètres (tous users) |
| **Passkeys ×5** | ℹ️ | Quota backend = 5 — normal si plein ; supprimer les inutilisées |
| **Pass auto-lock configurable** | ☑ | Paramètres → Sécurité Pass : 1/5/15/30 min, 1 h, jamais (`localStorage`) |
| **Mail — erreur sync visible** | ☑ | `last_sync_error` en base ; alerte sidebar + notif in-app si MDP/OAuth invalide |
| **Design system `@cloudity/ui` partout** | 🟡 | Tâches + Contacts → `ResponsivePage` ; reste : Calendar, Hub, Photos… |
| **Validation Samsung** | ☐ | `make test-mobile-suite` quand appareil libre |
| **Backoffice réutilisable (JobbingTrack)** | ⏸️ | **Hors scope Cloudity** — projet parallèle séparé ; intégration `/4dm1n` **plus tard** si besoin |

**Sondes `/health` dans les logs** : healthchecks Docker (`interval: 30s`, source `127.0.0.1`). Conteneurs `*-run-*` + `exited 0` = `docker compose run` pour `go test` lors de `make test` / `make up-full`.

| Chantier | Branche | État |
|----------|---------|------|
| Auth web + gitleaks | `feat/security-audit-hardening` | ☑ mergé `dev` |
| **gosec** tous services | `feat/security-gosec-hardening` | ☑ mergé `dev` |
| **U9** 2FA admin | `feat/admin-u9-2fa-advanced` | ☑ mergé `dev` |
| Audit mobile **H6c** | `feat/security-mobile-audit` | ☑ mergé `dev` |
| App Hub / Drive récents / Photos UX | `feat/app-hub-photos-ux-hardening` | ☑ prêt merge `dev` |

| Zone | Exemples | État session |
|------|----------|--------------|
| **Hors mail prod** (priorité) | MP-04 ☑ · Pass L3 ☑ · MP-08 Firefox ☑ · Photos albums web ☑ · **sync galerie mobile** ☑ · vignettes/dates Photos ☑ · UI-3 ☑ · U10 ☑ · **auth web admin** ☑ · Q4 gitleaks ☑ | **EN COURS** |
| **Mail local** (régression) | `make test-mail-mta-local` · alias-router · notifications Mail web | OK, pas bloquant |
| **Mail prod** (pause) | MX/SPF OVH · stack Portainer · `RELAY_SMTP_*` VPS · C7 livraison réelle | **NE PAS TOUCHER** |

---

## MAINTENANT — hors mail prod (`feat/app-hub-photos-ux-hardening`)

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **H1** | **Pass popup L3** | Liste onglet actif, filtre, copie, « Remplir l’onglet » — extension v0.2.1 | ☑ |
| **H2** | **Icônes extension Pass** | PNG 16/32/48/128 via `npm run icons` (source `mobile/photos` Icon-192) | ☑ |
| **H3** | **MP-08 Firefox** | `extensions/cloudity-pass-firefox/` + `make build-pass-extension-firefox` | ☑ |
| **H4** | **Photos — créer un album** | Web : « Nouvel album » → `createDriveFolder` ; dossier `Photos` exclu de la liste albums | ☑ |
| **H5** | **MP-04 Linux desktop** | `make test-mobile-desktop-linux` Drive + Photos | ☑ |
| **H5b** | **Photos — mobile Android** | Navigation Photos/Albums/Archivé/Corbeille/Verrouillé/Paramètres, viewer, corbeille Drive, verrou local biométrique, WorkManager + choix dossiers | ☑ |
| **H5c** | **Photos — vignettes & dates** | `GET /drive/nodes/:id/thumbnail`, `taken_at` (EXIF/galerie + nom fichier), exclusion PDF timeline, rate-limit gateway assoupli médias, file chargement mobile, défilement horizontal par jour, retour viewer → scroll | ☑ |
| **H5d** | **Drive — mobile Android** | Drawer (Mon Drive, **Récents**, Corbeille) ☑ ; FAB Nouveau ☑ ; recherche ☑ ; corbeille ☑ ; grille/liste ☑ ; import dossier SAF ☑ ; **déplacer** (picker dossier + `PUT parent_id`) ☑ ; partagés/favoris = attente API partage backend | ☑ |
| **H6** | **UI-3 Pass/Settings** | Imports `@cloudity/ui` (Pass + Settings) · `ResponsivePage` sur Paramètres | ☑ |
| **H6b** | **Auth suite mobile** | Broker Android `cloudity_auth_broker` (Photos/Drive/Mail, signature identique) : « Continuer avec ce compte », reprise session ; iOS Keychain group + AccountManager natif | 🟡 |
| **H6c** | **Sécurité mobile transverse** | Checklist **MOBILE-SECURITY-CHECKLIST.md** ☑ ; logout purge broker ☑ ; INTERNET release Drive/Pass ☑ ; reste sanitization erreurs Mail + TLS prod | 🟡 |
| **H6d** | **Photos — HEIC serveur** | Vignettes HEIC/HEIF via `goheif` ; `taken_at` depuis EXIF (`goexif`) + nom fichier | ☑ |
| **H7** | **Admin U9 / U10** | U10 CVE ☑ · U9 reset 2FA admin ☑ | ☑ |
| **H8** | **Photos — actions avancées** | Archive/verrouillé serveur (`photo_archived_at`, `photo_locked_at`, endpoints `/drive/photos/*`) + sélection groupée (Archiver, Verrouiller, Corbeille) + onglets Archivé/Verrouillé réels | ☑ |
| **H9** | **Paramètres par application web** | Pattern : bouton **Paramètres &lt;App&gt;** dans l’en-tête, modal local (prefs non destructives, localStorage). **Photos** · **Mail** · **Drive** · **Notes** · **Tâches** · **Contacts** ☑ | ☑ |
| **H10** | **Photos — coffre verrouillé local** | Web : code PIN local + biométrie WebAuthn (plateforme), garde avant chargement des vignettes, session courte, verrouillage auto à la sortie d’onglet, changement de code PIN depuis Paramètres Photos | ☑ |
| **H11** | **Coffres verrouillés — suite** | Web : garde locale + E2EE serveur, upload Drive chiffré dans dossier coffre, déchiffrement Photos au déverrouillage, changement PIN sans perdre `kdfSalt`, **re-chiffrement automatique des blobs après changement de PIN** (Notes/Contacts/Drive/Photos) | ☑ |
| **H12** | **Qualité tests frontend transverse** | Matrice non-skip renforcée : paramètres apps, coffres locaux, Photos archive/corbeille/verrouillé ; tests vault/E2EE : rotation PIN, tamper clé (`appVaultClient`), sync mail auth ; reste : E2E Playwright vault/mail sync erreur | 🟡 |
| **H13** | **Mail — notifications actionnables** | Web : clic notification in-app ou bureau → `/app/mail?account=&message=` (boîte + dernier message inbox après sync). Mobile/push système = plus tard. | ✅ |
| **H14** | **Mobile — gateway prédéfini dev/préprod/prod** | Mail/Drive/Photos/Pass : login e-mail + mot de passe ; gateway via `CLOUDITY_MOBILE_GATEWAY_URL` + `run-mobile.sh` ; champ URL masqué (avancé debug). Reste : HTTPS/CORS prod. | 🟡 |
| **H15** | **Mobile Photos — sauvegarde galerie robuste** | Sauvegarde qui continue en arrière-plan même si le panneau de suivi est fermé ; détection des dossiers/albums image du téléphone (Camera, Screenshots, WhatsApp/Telegram/etc.) avec proposition de sauvegarde par dossier ; reprise après relance et erreurs réseau lisibles ; onglet **Cet appareil** + badges sync (local/cloud) ; état backup persisté + reconcile au démarrage ; API `GET /drive/storage/summary` + affichage espace Photos/Drive dans Paramètres ; quota Mail API ; isolation dossier Photos backend ; **matching cloud↔local** (`/drive/photos/fingerprints`, `/drive/photos/match`, `content_hash`). **Reste** : validation E2E cross-appareil (Samsung libre). | 🟡 |
| **H16** | **Mobile — UI et prévisualisations fichiers** | Drive mobile : clic fichier → preview images/texte + ouverture externe PDF/Office/archives/autres ; **thème clair/sombre** partagé (`cloudity_shared/app_theme.dart`) sur Photos/Drive/Mail/Pass ; **passkey native** Photos/Drive (`CloudityPasskeyLoginButton`) ; reste : preview Photos renforcée, rendu PDF intégré et Office mobile à cadrer ensuite. | 🟡 |

**Checks récurrents hors mail prod** : `make test-pass-extension` · `make test` · `make test-dashboard-lint` · `make test-mobile-desktop-linux` (selon périmètre touché).

### QA-MATRIX — récap tests à revoir (2026-06-22)

Objectif : **une passe manuelle documentée** sur chaque couche, avec rapport dans `reports/` (ou `docs/operations/TESTS.md` §4).

| Couche | Commande(s) | Rapport / sortie | Revu |
|--------|-------------|------------------|------|
| **Unitaires backend Go** | `make test` (auth, gateway, mail, drive, …) | `reports/test-logs/<id>/` + `REPORT.md` | ☑ run `20260622-192608` |
| **Unitaires admin Python** | `make test` (pytest admin-service) | idem | ☑ |
| **Unitaires web Vitest** | `make test` / `make test-dashboard-one FILE=…` | idem | ☑ 387 tests |
| **E2E Playwright** | `make test-e2e` / `make test-e2e-playwright` | `reports/e2e/` + logs capture | ☑ 80/85 (5 skipped, `20260629`) |
| **Extension Pass** | `make test-pass-extension` | stdout + extension dist | ☐ |
| **Mobile Flutter hôte** | `make test-mobile-suite` | par app `mobile/*/test` | ☐ |
| **Mobile E2E device** | `make test-mobile-*` (Samsung) | intégration + ADB | ☐ |
| **Perf ressources** | `make perf-benchmark` / `-quick` | `reports/perf/benchmark-*/REPORT.md` | ☐ |
| **Sécurité** | `make test-security` · gitleaks · gosec | selon script | ☑ 2026-06-29 (avertissements npm audit) |
| **Infra / stack** | `make up-full` · healthchecks · migrations | `reports/up-full-test-*.log` | ☑ run `20260622-192608` |
| **Mail MTA local** | `make test-mail-mta-local` | logs Maddy | ☐ |

**Par bloc applicatif** (objectif : couverture unit + E2E/BDD documentée) :

| Bloc | Unitaires | E2E / intégration | Revu |
|------|-----------|-------------------|------|
| **Mail web** | Vitest `mailViewPreferences`, `mailSyncHelpers`, `MailPage` | Playwright boîte sync erreur | 🟡 prefs ☑ |
| **Mail mobile** | `mail_view_preferences`, `mail_account_helpers` | device inbox + resaisie MDP | 🟡 prefs ☑ |
| **Drive / Photos** | Go + Vitest pages | Playwright upload / vault | ☐ |
| **Pass / vault** | `appVaultPinRotation`, extension | E2E rotation PIN | 🟡 partiel |
| **Calendar** | `calendarAppPreferences` | Playwright création événement | 🟡 prefs ☑ |
| **Contacts / Tâches** | Vitest composants | Playwright CRUD | ☐ |
| **Admin OTA** | — | manuel manifeste + CI | 🟡 page + script `publish-mobile-manifest.sh` ☑ |
| **Drive auth partagé** | — | lien email, PIN dossier, 2FA fichier | ☐ voir BACKLOG DRIVE-SHARE |

**Automatisation souhaitée** : `make progress-recap` (STATUS/TODOS/BACKLOG + dernier `REPORT.md`) · email si `PROGRESS_EMAIL_TO` dans `.env`.

**Logs conteneurs à interpréter** (souvent visibles dans `make logs` ou `reports/container-logs/`) :

| Signal | Gravité | Action |
|--------|---------|--------|
| Redis `Memory overcommit must be enabled` | ⚠️ hôte | `make host-redis-sysctl` puis `APPLY=1 make host-redis-sysctl` |
| Postgres `connection reset by peer` / `client lost` | ℹ️→🟡 | **Souvent bénin** : le client Go (`mail-directory-service`) ferme la conn SQL quand la requête HTTP sync se termine (`defer conn.Close()` sur conn épinglée) ou quand le pool recycle — Postgres loggue alors `could not send data to client` / `FATAL: connection to client lost`. **Corrélation typique** : rafale `POST …/sync` (comptes 10/11/12…) + `mot de passe IMAP enregistré` + réponses **200**. **À vérifier** : boîtes Mail complètes, pas d’erreur UI ; si FATAL en boucle ou sync incomplète → auditer `GlobalMailSyncWatcher`, durée IMAP, `persistAccountPasswordAfterSync` (`imap_login.go`). |
| Mail `imap: connection closed` + rafale `sync select` | ⚠️ mail | OVH multi-dossiers — candidats absents = bruit ; vérifier si sync incomplète |
| `*-run-* exited with code 0` | ✅ | Tests `docker compose run` — normal pendant `make test` |
| `duplicate key users_tenant_id_email` | ℹ️ | `seed-admin` sur DB existante — attendu |

### Logs Postgres × Mail — à vérifier (2026-06-26)

**Constat utilisateur** (`make logs`) :

```
cloudity-postgres | could not send data to client: Connection reset by peer
cloudity-postgres | FATAL: connection to client lost
```

souvent **au même instant** que :

```
cloudity-mail-directory-service | [mail] IMAP connexion …@…ovh → ssl0.ovh.net
cloudity-mail-directory-service | [mail] sync account=N: mot de passe IMAP enregistré (chiffré)
cloudity-api-gateway            | POST /mail/me/accounts/N/sync -> 200
```

**Interprétation (probable, pas alarme immédiate)** :

1. Le **watcher Mail** (ou l’UI) lance plusieurs sync IMAP d’affilée (plusieurs boîtes OVH).
2. Chaque sync tient une **connexion Postgres épinglée** le temps de la requête HTTP (middleware `requireTenantAndUser` → `defer conn.Close()`).
3. À la fin (ou si le navigateur annule / timeout), le client ferme le socket **avant** que Postgres ait fini d’envoyer — d’où le `FATAL` côté serveur, **sans** forcément casser la sync (les `200` le confirment).

**Déjà en place** : `persistAccountPasswordAfterSync` utilise une **transaction courte** sur le pool (`imap_login.go`) pour limiter ces resets lors du chiffrement MDP.

**Checklist vérification** :

| # | Action | Coché |
|---|--------|-------|
| P1 | Confirmer que les messages arrivent bien dans Mail (inbox pas vide après sync) | ☐ |
| P2 | Compter les FATAL : 1–2 par rafale de sync = bruit ; dizaines/min = investiguer | ☐ |
| P3 | Si gênant : espacer les sync auto (`GlobalMailSyncWatcher`) ou logger côté mail-service au lieu de paniquer sur postgres | ☐ |
| P4 | Checkpoint Postgres (`checkpoint complete: wrote N buffers`) = normal, pas lié à l’erreur client | ☐ |

### Validation manuelle — `feat/app-vault-drive-upload-pin-rotation` (après `make down && make up` ports séquentiels)

| Zone | Action | État |
|------|--------|------|
| **Drive vault** | Créer coffre local, verrou PIN, déverrouiller | ☐ |
| **Drive upload** | Téléverser fichier + dossier, barre progression | ☐ |
| **Quota web** | Badge espace Drive + Photos + Paramètres | ☐ |
| **Admin titres** | `/4dm1n` → `Administration — Cloudity` ; Tenants → `Tenants — Cloudity` | ☐ |
| **Ports** | `make status` → gateway `:6002`, web `:6001` | ☐ |
| **Merge `dev`** | PR + revue après cases ci-dessus | ☐ |

### Validation mobile appareil (Samsung `R5CT7263YJL`, 2026-05-21)

Prérequis : `make up` · `make seed-admin` · mot de passe démo **`Admin123!`** · appareil `adb devices` = `device` · Wi‑Fi ou données si gateway LAN (sinon message « Pas de réseau » au lieu du dump `ClientException`).

| App | Tests hôte (`flutter test`) | E2E appareil (`integration_test`) |
|-----|---------------------------|-----------------------------------|
| **Photos** | ✅ (widget + prefs galerie) | ✅ E2E connexion + timeline ; vignettes `/thumbnail` + file chargement (anti-429) |
| **Drive** | ✅ | ✅ E2E connexion + écran Drive ; FAB Nouveau (dossier + import fichiers) |
| **Mail** | ✅ | ✅ E2E connexion + boîte |
| **2FA** | — | ✅ `make test-mobile-2fa` Drive + Mail + Photos (TOTP frais) |

Commande suite : `CLOUDITY_DEVICE_ID=R5CT7263YJL make test-mobile-suite` ✅ (2026-05-21).

### Validation différée — stack + Samsung (à rejouer demain)

**Contexte (2026-06-16)** : développement hors ligne (stack arrêtée, Samsung occupé par d’autres apps ADB). Les changements ci-dessous ont été couverts par **tests unitaires / `go test` / `flutter test` / `flutter analyze`** uniquement — **pas** de validation live.

| Zone | Tests hôte faits | À rejouer demain (stack `make up` + migrate) |
|------|------------------|-----------------------------------------------|
| Quota Mail + isolation dossier Photos | `go test` drive-service | `curl /drive/storage/summary`, Drive web sans dossier Photos |
| Matching cloud↔local (hash/nom) | `go test` + `photo_match_test` | Upload depuis 2e appareil, onglet **Cet appareil** badges |
| Passkey Credential Manager (Photos/Drive) | `flutter analyze` | Login passkey sur Samsung, RP ID / gateway alignés |
| Thème clair/sombre Flutter | `flutter test` | Bascule thème sur chaque app |
| Backup galerie + skip cloud match | `flutter test` photos | `make test-mobile-suite` quand Samsung libre |

**Samsung** `R5CT7263YJL` : ne pas lancer d’ADB concurrent ; rejouer `CLOUDITY_DEVICE_ID=R5CT7263YJL make test-mobile-suite` une fois libre.

### Incident `make status-watch` — `.env: Admin: commande introuvable` (2026-06-08)

Cause : `status.sh` faisait `source .env` ; `WEBAUTHN_RP_NAME=Cloudity Admin` (espace non quoté) est interprété par bash comme deux commandes.

Correctifs : `status.sh` lit les `PORT_*` via `_env_get` (parse sans exécuter le fichier) ; `.env.example` quote `WEBAUTHN_RP_NAME="Cloudity Admin"`. Si ton `.env` local a la même ligne, quoter la valeur ou régénérer depuis l’exemple.

### Incident admin web — `useAuth` hors `AuthProvider` + 401 `/auth/refresh` (2026-06-08)

Constat : crash HMR Vite sur pages admin (`Domaines.tsx`) ; boucle 401 sur `POST /auth/refresh`.

Causes :

- **HMR** : `authContext.tsx` recréait le contexte React au hot-reload (double bundle `index.html` + `admin.html`).
- **401 refresh** : rotation serveur du refresh token + appels **parallèles** (intervalle, focus, activité, `Global401Handler`, onglets admin + app).

Correctifs :

- `authContextStore.ts` — contexte stable hors HMR.
- `AuthProvider` remonté au niveau racine dans `AdminApp` / `App`.
- `authSessionRefresh.ts` — refresh unique + verrou **Web Locks** cross-onglets + sync `storage`.

Action utilisateur après déploiement : **reconnexion une fois** si l’ancien refresh token a été invalidé.

### Incident `make up` — drive-service unhealthy (2026-06-08)

Constat : `make up-full` échoue avec `dependency failed to start: container cloudity-drive-service is unhealthy`.

Cause : ajout **HEIC** (`goheif` + CGO `libde265`/`dav1d`) dans `drive-service` sans image Docker à jour — l’image locale datait d’avant `gcc`/`g++` dans `Dockerfile.dev`, donc `go run` échouait (`build constraints exclude all Go files` / `gcc not found`).

Correctifs :

- `backend/drive-service/Dockerfile.dev` : `gcc g++ musl-dev` + `CGO_ENABLED=1`.
- `docker-compose.yml` : `CGO_ENABLED=1` sur `drive-service`.
- `backend/drive-service/Dockerfile.prod` : build CGO pour GHCR (remplace `Dockerfile.go-service` statique).
- Après pull ou changement HEIC : **`docker compose build drive-service`** ou **`make rebuild-drive`** avant `make up`.

### Session Photos — vignettes, dates, UX mobile (2026-05-21)

**Problème** : miniatures en échec (429 gateway sur `/content` en masse), PDF mal typés affichés comme photos, dates de prise = date d’import, viewer sans retour à la position dans la grille.

**Livré** :

- **Backend** : migration `42-drive-photos-taken-at.sql` ; upload `taken_at` (RFC3339) ; timeline triée sur `taken_at` ; `GET /drive/nodes/:id/thumbnail` (JPEG redimensionné) ; PDF exclus de la timeline ; repli date depuis nom `IMG_*` / `PXL_*` / `Screenshot_*`.
- **Gateway** : pas de rate-limit global sur GET thumbnail/content Drive.
- **Web** : vignettes via `downloadDriveThumbnail` (concurrence 6) ; filtre client anti-PDF.
- **Mobile** : `photo_load_queue.dart` (4 req parallèles + retry 429) ; grille horizontale par jour ; sélection jour toggle ; viewer date en titre, glisser bas = retour grille à la bonne photo ; plein écran sur toute la timeline.

**Suite Photos (prochaine itération)** :

- **Broker Android** ☑ pilote — iOS Keychain Access Group + AccountManager natif à faire.
- Indicateur **état sync par photo** (uploadé / en attente / erreur).
- Chiffrement **coffre verrouillé** serveur (au-delà du masquage timeline/archive).

### Session Photos H8/H9 + UX web (2026-06-10)

**Livré** :

- **H8** : migration `43-drive-photos-archive-locked.sql` ; endpoints `/drive/photos/*` ; onglets Archivé/Verrouillé réels ; sélection groupée.
- **H9 (Photos)** : `Paramètres Photos` + `photosAppSettings.ts` (grille, dates, confirmations).
- **UX** : coche par date, menu contextuel, garde anti-import sur drag interne.
- **Mail** : persistance vue Mail scopée (`cloudity.mail.view.v1:{tenant}:{email}`) — dernière boîte **et** dossier (dont `unified`) ; mobile `MailViewPreferences`.
- **Calendar** : persistance vue + agenda (`calendarAppPreferences.ts`).
- **Admin** : encart « Distribution mobile & OTA » sur le tableau de bord (checklist REL-*).
- Checks : `go test` drive/photos-service ✅ ; Vitest PhotosPage (16) + MailPage (32) ✅.

### Incident Photos mobile — app installée mais bloquée au chargement (2026-05-21)

Constat : l’APK installée sur `R5CT7263YJL` restait sur l’écran de démarrage. Cause probable : ancienne session/gateway conservée en stockage sécurisé, appels HTTP sans timeout → bootstrap bloqué. Correctifs :

- `pm clear fr.cloudity.cloudity_photos` appliqué sur le téléphone puis relance.
- Timeouts ajoutés dans `mobile/photos/lib/auth_api.dart`, `drive_api.dart`, `session_store.dart`.
- SDK Flutter système `/usr/lib/flutter` est `root:root` et casse `flutter build apk` (`.kotlin/sessions/*.salive`). SDK utilisateur préparé dans `~/.local/share/cloudity-flutter` (copie sans cache root illisible, puis cache lisible recopié). `mobile-flutter-env.sh` le préfère désormais quand le SDK système est readonly.
- APK corrigée rebuildée avec ce SDK utilisateur, installée puis lancée ; écran observé : **Connexion — Cloudity Photos**.

### Blocage auth mobile — avant suite fonctionnelle (2026-05-21)

Problème UX : Photos/Drive demandaient gateway + e-mail + mot de passe + `tenant_id`, et une app installée ne pouvait pas récupérer un compte déjà utilisé par une autre app Cloudity.

Décisions / correctifs :

- **Court terme dev** : champs e-mail/mot de passe préremplis en debug (`admin@cloudity.local` / `Admin123!`), gateway auto via `adb reverse`, `tenant_id` masqué (défaut `1`). Pas de secret embarqué en release.
- **Court terme code** : aligner Photos + Drive sur Mail (gateway candidates, health-check auth, tenant optionnel, timeouts).
- **Vrai partage inter-app** : `flutter_secure_storage` est isolé par package Android ; les noms `cloudity_suite_*` ne partagent pas réellement les jetons. À implémenter ensuite : **Cloudity Auth Broker / Android AccountManager** + iOS Keychain Access Group, avec écran « Continuer avec ce compte / Ajouter un compte / Créer un compte ».
- Référence : `docs/produit/MOBILES.md` § **4.1 Auth suite mobile**.

---

## RÉFÉRENCE — moteur UI partagé (`@cloudity/ui`) — livré sur `dev`

**Priorité immédiate** — avant corps mail / checklist alias / Maddy VPS.

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **U0** | **Lire la cible** | **[CLOUDITY-UI-DESIGN-SYSTEM.md](./docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md)** + **STATUS.md** § 0b **A4** | ☑ |
| **U1** | **Branche** | `git checkout feat/cloudity-ui-design-system` (depuis `dev` à jour) | ☑ |
| **U2** | **Scaffold package** | `frontend/packages/cloudity-ui` + `package.json` + preset Tailwind + export `Button`, `Card`, `Input`… | ☑ |
| **U3** | **Réexports** | `@cloudity/shared` réexporte depuis `@cloudity/ui` (deprecated) pour ne pas casser les imports | ☑ |
| **U4** | **Première migration** | Pages **admin** `/4dm1n` → imports `@cloudity/ui` | ☑ |
| **U5** | **Tests** | `make test-dashboard` · pas de régression Vitest | ☑ |
| **U6** | **Catalogue** | Storybook minimal **ou** route dev `/4dm1n/dev/ui` (admin only) | ☑ |
| **U7** | **Responsive UI-DS** | Composants `Responsive*` dans `@cloudity/ui` ; Admin `ResponsiveShell` (drawer &lt;lg) ; catalogue `ResponsivePage/Grid` ; Mail pile nav/liste/lecture &lt;lg | ☑ |
| **U8** | **Admin polish opérationnel** | Domaines mail résiste aux réponses `null` ; Dashboard explique le mode cgroup ; Users affiche 2FA/dernière connexion sans faux reset ; CVE priorise les dépendances ; Passkeys/Settings explicitent le périmètre web/mobile/extension | ☑ |
| **U9** | **Admin sécurité 2FA avancée** | `POST /admin/users/:id/2fa/reset` — step-up TOTP admin, `audit_logs`, anti-lockout dernier admin 2FA, UI Users | ☑ |
| **U10** | **CVE enrichies** | OSV enrichi côté admin-service (`/v1/vulns/:id`) : résumé fallback `details`, alias CVE/GHSA, sévérité, affected ranges, versions corrigées ; scan élargi à tous les manifests supportés (`13 go.mod`, `3 package-lock`, `1 requirements`) ; scan final = **760 paquets / 0 vuln OSV** | ☑ |

**Branche Git** : `feat/cloudity-ui-design-system` → **fusionnée dans `dev`** (2026-05-20).  
**Case BACKLOG** : **UI-DS-01** — phases **UI-0…UI-8** livrées sur cette branche ; **UI-10 CVE enrichies** livré ; **UI-9** (2FA admin avancée) reste à faire.
**Branche précédente** : `feat/mail-alias-checklist` → **fusionnée dans `dev`** (2026-05-21, fast-forward `00a0474c`).  
**Branche précédente** : `feat/mail-alias-prod` → **fusionnée dans `dev`** (2026-05-21, fast-forward `0a31874a`).  
**Branche précédente** : `feat/mail-mta-alias-delivery` → **fusionnée dans `dev`** (2026-05-21, fast-forward `04a9c68c` : Maddy `alias-router` + notifications Mail web).  
**Branche active** : **`feat/photos-gallery-mobile-sync-security`** — **`dev`** et toutes les branches `feat/*` locales synchronisées (`1ae4e708`, 2026-05-21).

---

## PAUSE — mail prod uniquement (OVH · VPS · Portainer)

Reprendre **uniquement** sur demande explicite **« on retourne sur la partie mail »**.  
Le **mail local** (docker, tests, admin checklist) peut servir de régression sans avancer la prod.

## ENSUITE — mail prod, alias, déploiement (après chantiers hors mail prod)

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **1** | **Santé locale** | `make doctor` · `make migrate` · **`make test`** · gateway OK | ☑ |
| **2** | **Corps mail manquant** | `make deploy-mail` ✅ · test Go MIME `attachment` ✅ · test Vitest **Recharger le message** ✅ · validation manuelle message impôts ✅ (`dumb@delhomme.ovh`, corps IMAP rechargé) | ☑ |
| **3** | **MTA alias auto-hébergé** | Local validé : alias créé, règle auto, `/mail/internal/alias-resolve` OK, on/off OK. Maddy local route maintenant vers `alias-router:2527` (plus de `dummy`) ; port hôte `2526`, alias absent = 550 propre. C7 réel reste livraison IMAP/redirection fournisseur | 🟡 |
| **4** | **Admin Domaines + checklist C1–C7** | C1–C6 ☑ ; C6 couvert par Vitest + Playwright Mail (`from_email` alias actif, alias désactivé exclu) ; C7 🟡 (Maddy local accepte RCPT, livraison IMAP réelle/redirection fournisseur non rejouée) | 🟡 |
| **5** | **J8 Pass / extension** | **MP-06 + MP-07** : autofill + E2E Chromium ; **popup L3** : liste onglet actif, copie, remplir (v0.2.1) ; prochain : icônes PNG, **MP-08** Firefox/Safari | 🟡 |
| **5b** | **2FA locale compte démo** | Web + mobile ADB automatisés (`test-mobile-2fa`). Optionnel : scan QR manuel authenticator (hors CI) | ☑ |
| **6** | **DNS + Maddy prod** | **[MAIL-ALIAS-DNS-MADDY.md](./docs/operations/MAIL-ALIAS-DNS-MADDY.md)** · Admin Domaines : bloc DNS copiable · `make test-mail-mta-local` / `make mail-mta-local-up` · MX/SPF/DKIM sur VPS (manuel) | 🟡 |
| **7** | **Registry + Portainer** | GHCR · webhook — **[DEPLOIEMENT-SUIVI.md](./docs/operations/DEPLOIEMENT-SUIVI.md)** § B | ☐ |
| **8** | **Linux / mobile / stores** | **[DISTRIBUTION-LINUX-DESKTOP.md](./docs/operations/DISTRIBUTION-LINUX-DESKTOP.md)** | ☐ |

### Barrière qualité avant reprise mail prod — PAUSE

Ne pas reprendre **DNS OVH / Maddy VPS / Portainer mail / relais SMTP prod / C7 réel** tant que l’utilisateur ne dit pas **« on retourne sur la partie mail »**.

Avant de reprendre les changements DNS/VPS/MTA prod, stabiliser et noter les résultats :

| # | Action | Comment | Coché |
|---|--------|---------|-------|
| **Q0** | **Tests Pass extension** | `make test-pass-extension` — domain matcher + build MV3 ; `make test-e2e-playwright-pass-extension` — Chromium extension + autofill MP-07 | ☑ |
| **Q1** | **Unit/app complets** | `make test` — Go, pytest, Vitest Docker | ☑ |
| **Q2** | **Pass ciblé** | `make test-pass` — passwords-service, pass-crypto, import Proton, extension MV3 | ☑ |
| **Q3** | **Lint front** | `make test-dashboard-lint` | ☑ |
| **Q4** | **Sécurité** | `make test-security` ✅ : gitleaks ☑ · gosec baseline `.gosec.json` + **GOSEC.md** (branche `feat/security-gosec-hardening`) ; corrections G104 ciblées et `GOSEC_BLOCKING=1` à activer après vert complet | 🟡 |
| **Q5** | **E2E web** | `make test-e2e` ✅ ; `make test-e2e-playwright` ✅ — 72 passed, 4 skipped après corrections login/passkeys/mail/pass | ☑ |
| **Q6** | **Mobile** | `make test-mobile-suite` ✅ Photos/Drive/Mail hôte ; integration_test device ignorés car aucun appareil ADB détecté | ☑ |
| **Q7** | **Perf** | `make perf-snapshot LABEL=before-mail-alias-prod` ✅ ; `make perf-budgets` 🟡 KO sur `LOADAVG_1M=8.18 > 6.0` après grosse batterie tests, conteneurs OK (`CPU 4.7%`, `MEM 1145 MiB`) | 🟡 |
| **Q8** | **2FA locale fonctionnelle** | Web E2E 5/5 (activation, TOTP, mauvais code, recovery, recovery réutilisé refusé) + mobile ADB 2FA Drive/Mail/Photos avec mauvais code puis TOTP frais (`make test-mobile-2fa`, Samsung `R5CT7263YJL`, gateway LAN) | ☑ |

### 2FA locale — à valider rapidement

Objectif : même en local, le compte de dev doit pouvoir activer la 2FA et prouver que tout Cloudity reste utilisable.

| Étape | Validation attendue | État |
|-------|---------------------|------|
| **2FA-1** | `/app/settings` (ou `/app/settings/canonical`) : activation TOTP, QR, secret manuel, codes de récup (`TwoFactorSection`) | ☑ |
| **2FA-2** | Activer TOTP sur compte dédié `e2e-2fa@cloudity.local` (`make seed-e2e-2fa`), copier les codes, se déconnecter | ☑ (E2E) |
| **2FA-3** | Login web : email + mot de passe → étape code TOTP → accès `/app` | ☑ (E2E) |
| **2FA-4** | Login web avec un code de récupération → accès OK + rappel de régénérer | ☑ (E2E) |
| **2FA-5** | E2E Playwright dédié `e2e/twofa.spec.ts` + `make test-e2e-playwright-twofa` : activation, TOTP, mauvais code, recovery, recovery réutilisé refusé (ne touche pas `admin@cloudity.local`) | ☑ |
| **2FA-6** | Mobile Drive/Mail/Photos : écran 2FA + mauvais code refusé + TOTP frais calculé au moment du test → écran principal (`integration_test/twofa_flow_test.dart`, `make test-mobile-2fa`) | ☑ |

Note : ne pas laisser le compte démo dans un état qui casse les E2E standards. Prévoir une remise à zéro contrôlée ou un utilisateur de test dédié `e2e-2fa@cloudity.local`.

### Git — ne jamais versionner

| Dossier / fichier | Pourquoi |
|-------------------|----------|
| **`frontend/apps/cloudity-web/.vite/`** | Cache Vite — `**/.vite/` dans `.gitignore` |
| **`deploy/mail-mta/.env`** | FQDN / IP réels |
| **`.certs/`** | mkcert local |

**Ne pas** `git add *` — toujours `git status` puis chemins ciblés.

---

## Quel fichier lire pour quoi ?

| Fichier | À quoi il sert | Tu l’ouvres quand… |
|---------|----------------|-------------------|
| **`TODOS.md`** (racine, **ce fichier**) | **Liste du jour** + secrets + déploiement (liens) | **Chaque session** — § MAINTENANT puis § ENSUITE |
| **`STATUS.md`** (racine) | État global, historique, tableaux Drive/Mail détaillés | Contexte large, pas la checklist du jour |
| **`BACKLOG.md`** (racine) | Cases produit (**UI-DS-01**, **MAIL-ALIAS-01**, …) | Tu codes une feature listée |
| **`docs/architecture/CLOUDITY-UI-DESIGN-SYSTEM.md`** | Vision moteur UI `@cloudity/ui` | Chantier design system |
| **`docs/operations/TODO.md`** | Dépannage Mail/perf **ancien** + liens | Symptôme console / PLAN.md — **pas** la priorité sprint |
| **`docs/LOGS.md`** | Journal des tours **assistant** | Toi : optionnel ; l’IA y écrit après chaque session |
| **`docs/operations/DEPLOIEMENT-SUIVI.md`** | Phases A→F Portainer / CI / Android | **Après** merge `dev`, quand tu publies sur le VPS |

Il n’y a **pas** de `TODO.md` à la racine : seulement **`TODOS.md`** (avec un **S**).

---

## Périmètre obligatoire — état réel (web + mobile + extension)

Source détaillée : **[MULTI-PLATEFORME.md](./docs/produit/MULTI-PLATEFORME.md)** · index `docs/` : **[docs/README.md](./docs/README.md)** (58 fiches).

| Produit | Web | Mobile Android | Extension | Prochaine brique code |
|---------|-----|----------------|-----------|------------------------|
| **UI transverse** | ✅ `@cloudity/ui` sur `dev` | — | — | **UI-3** Pass/Settings utilisateur (BACKLOG) |
| **Mail** | ✅ | ✅ MVP | — | Corps MIME · alias · **MAIL-ALIAS-02** |
| **Drive** | ✅ | ✅ MVP + Linux desktop build validé | — | Polish mobile + gros fichiers |
| **Photos** | ✅ archive/verrouillé serveur + sélection UX + paramètres locaux | ✅ timeline + sync + viewer + Auth Broker | — | état sync par photo · iOS broker · H9 autres apps |
| **Pass** | ✅ | ✅ lecture | ✅ MV3 autofill + popup L3 (v0.2.1) | Icônes · **MP-08** Firefox · édition mobile |
| **Alias mail** | ✅ enregistrement + filtre | (via Mail/Pass) | — | **05** MTA · **06** DKIM |

**Phase 2 alias (MTA)** : domaine alias réel **dans l’UI / `.env` / Portainer** (pas en Git) · réception `*@<domaine-alias>` via **Maddy/Postfix** → lookup Cloudity → livraison boîte IMAP · **Admin Domaines** suit hostname/MX/SPF/DKIM/DMARC attendus · puis **C1–C7**.  
**Préprod** : possible **après** merge `dev` + variables Portainer — pas avant boîte mail + alias testés en local.

---

## Sécurité avancée (plus tard — pas maintenant)

Feuille de route **menaces IA** + **post-quantique** : **[MENACES-IA-ET-DEFENSE.md](./docs/securite/MENACES-IA-ET-DEFENSE.md)** (SEC-IA-*, SEC-PQC-*).  
Court terme en cours : **SECURITE.md**, **MTLS-INTERNE.md**, **ANTI-SPAM-ET-ABUS.md**.

### Où est quoi dans `docs/` ?

| Dossier | Exemples | Lié à ton périmètre |
|---------|----------|---------------------|
| **`docs/produit/`** | ROADMAP, MOBILES, MAIL-ALIAS-*, SPRINT-PASS | Vision + sprint |
| **`docs/architecture/`** | **CLOUDITY-UI-DESIGN-SYSTEM**, SERVICES | UI + infra |
| **`docs/operations/`** | DEPLOIEMENT-SUIVI, TESTS, DEV-VERIFICATION | Local, CI, VPS |
| **`docs/securite/`** | SECRETS, MTLS-INTERNE | Secrets / mTLS |
| **`docs/decisions/`** | QUESTIONNAIRE multi-repo | Plus tard |

---

## Avant session

1. **`git status`** — branche = **`feat/security-gosec-hardening`** (ou `feat/admin-u9-2fa-advanced` / `feat/security-mobile-audit` selon le chantier).
2. **`docker info`** puis **`make test`** — **[docs/operations/DEV-VERIFICATION.md](./docs/operations/DEV-VERIFICATION.md)** § 0.
3. Relire **§ ENSUITE** #3–#4 de ce fichier.

---

## `.env` / secrets (alignement `.env.example`)

| Besoin | Commande |
|--------|----------|
| Nouveau fichier `.env` complet (CSPRNG) | **`make secrets`** |
| Clé IMAP/SMTP | **`make ensure-mail-encryption-key`** |
| Stack mail + extension | **`make doctor`** |
| Sync IMAP après rotation de clé | Ré-enregistrer le MDP boîte dans l’UI Mail |

Référence : **[ENV-GENERATION.md](./docs/operations/ENV-GENERATION.md)** · **[SECRETS.md](./docs/securite/SECRETS.md)**

**À faire avant VPS/prod mail** : régénérer les secrets partagés visibles/utilisés en local pendant la mise au point (`MTA_INTERNAL_TOKEN`, clés alias/mail si elles ont été exposées dans des échanges ou terminaux), puis reporter uniquement les nouvelles valeurs dans `.env` / Portainer — jamais dans Git.

---

## Alias mail — cible produit (Pass ↔ Mail)

**Doc maître** : **[MAIL-ALIAS-VISION.md](./docs/produit/MAIL-ALIAS-VISION.md)** · pratique : **[MAIL-ALIAS-DEMARRAGE.md](./docs/produit/MAIL-ALIAS-DEMARRAGE.md)**.

| Priorité | Tâche | État |
|----------|--------|------|
| P0 | Enregistrement Cloudity ≠ création MX/OVH | Doc ✅ |
| P1 | **MAIL-ALIAS-01** — activer/désactiver alias | ✅ |
| P1 | **MAIL-ALIAS-02** — règle auto par alias | ✅ |
| P1 | **Phase 2 MTA** — réception alias auto-hébergée (local puis VPS) | EN COURS |
| P2 | **MAIL-ALIAS-05** — MTA / Maddy | BACKLOG · après UI + corps mail |
| P2 | **MAIL-ALIAS-06** — DKIM / SPF | BACKLOG |

---

## Feuille de route déploiement (méthodique)

**Document détaillé** : **[DEPLOIEMENT-SUIVI.md](./docs/operations/DEPLOIEMENT-SUIVI.md)**

| Phase | Objectif | Lien rapide |
|-------|----------|-------------|
| **A** | Local monorepo | SUIVI § 2 |
| **B** | Git → GHCR → Portainer | SUIVI § 3 |
| **C** | Stacks Cloudity vs Maddy | **[PORTAINER-MAIL-ALIAS.md](./docs/operations/PORTAINER-MAIL-ALIAS.md)** |
| **D** | NPM + DNS + HTTPS (web) | SUIVI § 5 |
| **E** | Android APK + `version.json` | **[RELEASE-AND-DISTRIBUTION.md](./docs/operations/RELEASE-AND-DISTRIBUTION.md)** |
| **F** | Mise à jour un service | `make deploy-web`, `deploy-mail` |
| **G** | Linux desktop (.deb, Flatpak, Snap) | **[DISTRIBUTION-LINUX-DESKTOP.md](./docs/operations/DISTRIBUTION-LINUX-DESKTOP.md)** |

### Registry Docker → Portainer

| Étape | Action |
|-------|--------|
| 1 | GHA **`docker-publish.yml`** → **GHCR** |
| 2 | Stack Portainer : `image:` + `TAG` |
| 3 | Webhook redeploy ou Watchtower |
| 4 | Smoke `/health` + login |

**Prochaine action** : § ENSUITE #3–#4 — configurer le suffixe alias dans l’UI, créer la redirection fournisseur, valider réception + filtre.

---

## Déploiement (références rapides)

| Besoin | Doc / commande |
|--------|----------------|
| Hub 3 environnements | **[DEPLOIEMENT-ENVIRONNEMENTS.md](./docs/operations/DEPLOIEMENT-ENVIRONNEMENTS.md)** |
| Front / Mail / API seul | `make deploy-web` · `deploy-mail` · `deploy-gateway` |
| Compose Portainer | **[deploy/portainer/README.md](./deploy/portainer/README.md)** |

## Prod VPS (sécurité)

**[DEPLOIEMENT-VPS-PORTAINER-NPM.md](./docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** + **[HOMELAB-SECURITE.md](./docs/architecture/HOMELAB-SECURITE.md)** (Q15).

---

## URL-CAPABILITIES (post J7 bis)

Voir **[docs/securite/URL-CAPABILITIES.md](./docs/securite/URL-CAPABILITIES.md)** et **[BACKLOG.md](./BACKLOG.md)** (section UC-DOC / UC-FE).
