# À faire (Cloudity) — pivot quotidien

> **Tu veux travailler sans parcourir toute la doc ?** Tiens **`docs/TODO.md`** (ce fichier) + **`docs/PLAN.md`** : le PLAN explique les **symptômes** (console, Mail) et pointe vers le reste ; le TODO liste **quoi faire** et les **liens** vers les gros documents quand il faut le détail.

## Liens utiles (détail ailleurs)

| Sujet | Fichier |
|--------|---------|
| Dépannage console, Mail, sync par boîte, dates corbeille | **[PLAN.md](./PLAN.md)** |
| Tests front **Docker d’abord** (Vitest / ESLint) ; Playwright sur l’hôte | **[TESTS.md](./TESTS.md)** § **1** — `make test-dashboard*`, `make test` ; E2E Mail : `make test-e2e-playwright-mail` |
| Cases à cocher racine | **[../BACKLOG.md](../BACKLOG.md)** |
| Suivi produit / tableaux Drive, Mail, éditeur | **[../STATUS.md](../STATUS.md)** |
| IMAP, mobile, archivage | **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** |
| Tests `make test`, Vitest, Playwright | **[TESTS.md](./TESTS.md)** |
| Roadmap par app | **[ROADMAP.md](./ROADMAP.md)** |
| Performances, stack, diagnostic, exports Profiler / Chrome | **[PERFORMANCES.md](./PERFORMANCES.md)** |
| Index de tout `docs/` | **[README.md](./README.md)** |
| Vision suite (ordre P0–P7, phases A–F, décisions produit) | **[VISION-SUITE.md](./VISION-SUITE.md)** |

**Cohérence** : la liste **Priorités actuelles** ci-dessous est le **pivot quotidien** ; l’ordre **stratégique** (Mail → Alias → Pass → Photos → …) vit dans **VISION-SUITE.md** avec l’**état réel** du dépôt (Mail déjà largement livré, Photos en cours, etc.). **BACKLOG.md** condense les cases à cocher ; **STATUS.md** détaille l’avancement.

## Prochaines étapes — synthèse (quoi faire ensuite)

Ordre **pratique** dérivé de **STATUS**, **BACKLOG**, **SYNC-BACKLOG**, **TESTS**, **PLAN** (pas seulement la boussole **VISION-SUITE**) :

1. **Mail (web)** — pousser le « quotidien » : **stabilité React** — livré + **E2E** `make test-e2e-playwright-mail` ; enchaîner **sous-dossiers IMAP `CREATE`**, **threads / conversations**, PJ liste/tailles/sync **multi-boîtes**, **snooze** ; **recherche cross-apps** au hub (**BACKLOG**). Tenir **PLAN.md** pour console / dates corbeille.
   - **Progression 2026-05-05** : opérateurs de recherche ajoutés (`from:`, `subject:`, `tag:`) + tests Vitest ; **E2E Mail règles** ajoutés (création combinée + rétro-application `rules/apply`) dans `e2e/mail.spec.ts`.
2. **Mail (suite doc)** — aligner **BACKLOG** : règles = **MVP livré** ; reste **tests API/E2E** combinés et polish.
3. **Photos** — **création d’album** (API + UI), purge corbeille depuis Photos, **archivé**, ajustement barre bas si sidebar `w-14` (**TODO** § Photos web).
4. **Alias mail** — MVP boîte OK ; **système complet** expiration / vue globale / DNS (**SYNC-BACKLOG §2**, **ROADMAP APP-04**).
5. **Pass** — densifier MVP (TOTP, etc. selon **ROADMAP**).
6. **Drive / recherche** — E2E, ZIP/PPT serveur ; recherche **globale** Mail + Pass (**TESTS.md** § 4).
7. **Qualité** — **`make test`** (Docker) avant merge ; compléter les lignes **TESTS.md** § 4 pour les trous connus.

**PLAN.md** = dépannage et sync par boîte (déjà livré § 9), pas la liste produit prioritaire.

## Priorités actuelles

- **Sécurité dépendances (suite à `make test-security`)** : traiter les alertes **npm audit** de `frontend/admin-dashboard` avec un lot dédié.
  - **Progression 2026-05-05** : lot initial appliqué (`npm install` ciblé + `npm audit fix`) ; passage de **10 vulnérabilités** à **5** dans `admin-dashboard`.
  - **Progression 2026-05-05 (suite)** : migration contrôlée **`vite@8` + `vitest@4` + plugin SWC** effectuée ; audit ramené à **1 vulnérabilité high** restante (`xlsx`, pas de fix upstream).
  - **Reste à traiter** : stratégie `xlsx` (remplacement, sandbox stricte, ou isolation fonctionnelle).
  - `axios` (high, fix disponible) : mettre à jour et revalider `make test` + `make test-e2e-playwright`.
  - `@xmldom/xmldom` (high, transitive, fix disponible) : mise à jour lockfile / dépendance parente.
  - `picomatch` (high, transitive, fix disponible) : remonter via mises à jour `vite`/tooling.
  - `xlsx` (high, **pas de fix upstream**) : décider mitigation produit (sandbox stricte, limitation source/type, ou remplacement bibliothèque).
  - `esbuild` / `vite` / `vitest` (moderate + upgrade majeur potentiel) : ouvrir lot de migration contrôlée pour éviter `npm audit fix --force` aveugle.
  - `govulncheck` (signalétique sur services Go) : revue manuelle des rapports `reports/govulncheck-*.txt`, qualifier exploitabilité réelle puis créer tickets de MAJ ciblées par service.

- **Photos** : **`docs/PHOTOS.md`** — timeline, page web ; suite mobile, albums, EXIF, WorkManager.

### Photos web — suite produit (à faire)

- **Albums** : navigation **dans** un album (**livré** : URL **`/app/photos?tab=albums&album=<id>`**, grille images + lightbox, retour liste) ; **création d’album** (API + UI) ; couverture / titre ; cartes liste **mode sombre** (contraste, bordures — itéré avril 2026).
- **Corbeille Photos** : **partiellement livré** — onglet **Corbeille** = images dans **`GET /drive/nodes/trash`**, grille + **Restaurer** (`POST …/restore`) + lien vers corbeille Drive complète ; **à faire** : suppression définitive (purge) depuis Photos, regroupement par date, UX sans doublon API.
- **Archivé** : dossier ou étiquette **archivé** côté API + liste dans l’onglet Archivé (hors simple placeholder).
- **Verrouillé / coffre** : espace **sécurisé** (photos sensibles, chiffrement / biométrie — alignement **SECURITE.md** / **TR-01**), navigation depuis l’onglet Verrouillé.
- **Navigation** : barre **bas d’écran** type Google Photos (livré) ; si la sidebar app est **repliée** en `w-14` sur desktop, ajuster le décalage `left` de la barre (aujourd’hui calé sur sidebar **dépliée** `md:left-56`).

- **Drive** : Récents, recherche **`?q=`** + API **`/drive/nodes/search`** ; suite E2E, ZIP/PPT serveur (**SYNC-BACKLOG §3b**, **TESTS**).
- **Éditeur** : **`docs/editeur-docs.md`**, **STATUS §1b** — LaTeX cible, TipTap / tableur.
- **Calendrier** : mois multi-agendas OK ; semaine/jour, invitations.
- **Contacts** : liste/fiche OK ; groupes, import/export. **Liaison Mail ↔ contacts** (règles, fiches liées) : à planifier **une fois le MVP Mail web** (liste, PJ, multi-boîtes) stabilisé.
- **Mail** : alias boîte, polling, menu message — OK. **Sync par boîte** — **PLAN §9**. **Sync auto** : batch unique + anti-chevauchement + anti-rafale + pause onglet non visible + indicateur visuel en bas de la sidebar (`Sync auto en cours…`). **Cadence (avril 2026)** : sur la page Mail, tick **~12 s** (onglet visible) ; **~18 s** pour le watcher **hors** page Mail (notifs) ; **sync immédiate** après **envoi** d’un message ; retour onglet avec garde **~14 s** (évite la double sync). *Push / idle IMAP* : pas encore — chargement des nouveaux mails reste **périodique** côté client. **Paramètres compte pendant sync** : champs IMAP/SMTP verrouillés tant que la boîte est en synchronisation (message explicite dans la modale). **Corps message à l’ouverture** : fallback IMAP `BODY.PEEK[]` déclenché si corps absent ou vide, puis persistance backend. **Dossiers spéciaux** — **SYNC-BACKLOG §0b** + migration **23**. **En-têtes MIME complets** : liens mail/URL cliquables en cours d’itération UX. **Actions “Nouveau/Recharger/Étiquettes”** : déplacées dans la colonne gauche entre “Boîtes mail” et “Dossiers” ; à finaliser côté responsive/collapsed. **Stabilité React** : correction boucle `Maximum update depth` (effets AppChrome + garde anti-setState inutile) ; surveillance console encore requise. **Corbeille Mail** : suppression définitive en masse livrée. **Règles automatiques Mail** : MVP livré (conditions expéditeur/sujet/PJ + action dossier + marquer lu, application rétroactive + exécution après sync) + **réconciliation IMAP** best-effort (move + lu/non lu). **Notifications hors page Mail (web)** : livrées via watcher global AppLayout. Suite : archivage PG / quota OVH, push, anti-spam avancé (**SYNC-BACKLOG §1**). **Console / favicons** : **PLAN** §1–5.
- **Mail — feuille MVP+ (cible produit)** : multi-boîtes, sync IMAP, vues, réponse/transfert, dossiers, tags, corbeille/spam/archive, FTS, règles, alias, PJ, .ics partiel, favicons — en grande partie **déjà en piste** dans le dépôt. **Manquent notamment** (ordre utile) : **sous-dossiers IMAP `CREATE`**, **threads** en UI, **cache / mode hors ligne** (mobile + web), **snooze**, **blocage expéditeur/domaine**, **images distantes désactivées** par défaut + anti-phishing, **hub PJ** dédié, bêta (envoi programmé, newsletter center, smart folders, …). *Stabilité AppPageChrome / E2E Mail : **BACKLOG** + **TESTS** § 4.8.* Synthèse stratégique : **VISION-SUITE.md** P1 ; statut : **STATUS** (tableaux M1–M8).
- **Mobile Mail** : **sync in-app périodique + bannière nouveaux messages** livré ; login mobile simplifié (**email + mot de passe**, gateway auto, affichage mot de passe, bouton inscription). UI en cours d’alignement avec le web : cartes messages arrondies + menu `⋮` (lu/non lu, spam, corbeille, archive, réception). Reste **notifications push système** (FCM/APNs + Linux desktop app), brouillon IMAP, PJ inline avancé, et **pilotage admin ON/OFF de l’auto-inscription** (politique sécurité).
- **Mobile** : `scripts/run-mobile.sh`, **`FLUTTER_ROOT`** (voir **MOBILES.md** §5).
- **Performances (chantier à industrialiser)** : état des lieux et pistes dans **PERFORMANCES.md** ; cible **ROADMAP TR-06** (métriques runtime, Web Vitals par route, `pprof` Go sous contrôle, profil Flutter) — toujours compatible **SECURITE.md** et une UX fluide.

## Ordre de livraison : applications **web** puis **mobile**

Pour chaque produit de la suite (**Photos**, **Mail**, **Drive**, etc.), on vise d’abord une **expérience web complète** dans **`frontend/admin-dashboard`** (API gateway + JWT, tests **Vitest** / **`make test`**), puis on **porte ou complète** le **client mobile** (`mobile/…`, Flutter) une fois les flux et contrats d’API stabilisés. Cela évite de figer trop tôt une UX native alors que le produit évolue encore. Détail matrice web × mobile, commandes **`make run-mobile`**, et parité attendue : **[MOBILES.md](./MOBILES.md)** (§ **0** + matrice § **1**).

## Migrations base de données

- **`make migrate`** (racine du repo, Docker) applique **`infrastructure/postgresql/migrations/`**. **`make rebuild`** inclut migrations + redémarrage. Détail : **[TESTS.md](./TESTS.md)** (section Migrations).
- **Backlog** : outil dédié (CLI ou service bas niveau) + **panneau admin web / app admin mobile** pour état des migrations, verrou, rollback documenté — **STATUS**, **PLAN §11**, **SYNC-BACKLOG §0d**.

## Tests : toujours valider **dans les conteneurs**

- **`make test`** : batterie complète dans Docker (Go, pytest, Vitest). C’est la cible avant merge.
- **Smokes rapides** : **`make test-auth`** (auth seul) ; **`make test-go-one SERVICE=mail-directory-service`** (ou `drive-service`, `api-gateway`, …). Détail : **[TESTS.md](./TESTS.md)** § 1.
- **Stack déjà démarrée** : **`make test-docker`** — mêmes tests via **`exec`** sur les binaires réellement up.
- **CI** : **`.github/workflows/docker-unit-tests.yml`** exécute **`make test`** sur push / PR (`main`, `master`). Détail : **[TESTS.md](./TESTS.md)**.
- Les **`npx vitest`** / **`npm run test:drive`** sur l’hôte restent utiles pour le cycle rapide en dev, mais la **vérité partagée** reste **`make test`** (Docker).

## Notes techniques (rappels)

- **Drive / HMR / Téléverser** : overlay + `UploadProvider`, inputs dans **AppLayout**, **TODO** historique (perf, `startTransition`) — inchangé ; détail dans les paragraphes ci-dessous si besoin de recontextualiser.

### Problème résolu : hub / sidebar → Photos sans F5

- **Symptôme** : depuis le tableau de bord ou une autre app, un clic vers **Photos** ne chargeait pas correctement la chronologie tant qu’on ne rechargeait pas la page.
- **Correctif** : **`frontend/admin-dashboard/src/layouts/AppLayout.tsx`** — **`<Outlet key={location.pathname} />`** (on évite d’inclure `search` pour ne pas démonter **Drive** à chaque **`?q=`**). **Photos** : affichage chargement / vide basé sur **`isPending`** plutôt que **`isLoading`** (RQ v5).

### Problème résolu : crash HMR + lenteur au clic Téléverser

- **Crash "useUpload must be used within UploadProvider"** : l’overlay utilise `useContext(UploadContext)` et ne rend rien si le contexte est absent (HMR). `useUpload()` ne lance plus d’erreur (retourne une valeur par défaut si pas de provider).
- **Clic Téléverser lent / navigateur qui rame** : les inputs fichier/dossier sont montés **une seule fois** dans le layout (`DriveUploadInputs` dans `AppLayout`). **`UploadTriggerContext`** pour éviter les re-renders du parent fichier sous Chromium.
- **Progression téléversement** : XHR `onprogress` → pourcentage dans l’overlay.

## Tests Drive (Téléverser, Dossier, Nouveau dossier)

- **Vitest** : `npm run test:drive` — chaîne avec AppLayout.
- **Boucle** : `RUNS=20 npm run test:drive:loop`.
- **Playwright** : `npm run test:e2e:drive` — prérequis `make up`, etc. (**TESTS.md**).

## Notifications

- Piste Web Push + backend ; mobile plus tard.

## Session / sécurité (fait)

- Refresh token, **SYNC-BACKLOG** §4.

## Sécurité long terme (à préparer)

- [ ] **Post-quantique (PQC)** : définir le plan de transition (inventaire des usages crypto, mode hybride classique+PQC, rotation des clés/certificats, compatibilité clients et validation perf/sécurité).
