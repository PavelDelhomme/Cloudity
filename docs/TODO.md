# À faire (Cloudity) — pivot quotidien

> **Tu veux travailler sans parcourir toute la doc ?** Tiens **`docs/TODO.md`** (ce fichier) + **`docs/PLAN.md`** : le PLAN explique les **symptômes** (console, Mail) et pointe vers le reste ; le TODO liste **quoi faire** et les **liens** vers les gros documents quand il faut le détail.

## Liens utiles (détail ailleurs)

| Sujet | Fichier |
|--------|---------|
| Dépannage console, Mail, sync par boîte, dates corbeille | **[PLAN.md](./PLAN.md)** |
| Cases à cocher racine | **[../BACKLOG.md](../BACKLOG.md)** |
| Suivi produit / tableaux Drive, Mail, éditeur | **[../STATUS.md](../STATUS.md)** |
| IMAP, mobile, archivage | **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** |
| Tests `make test`, Vitest, Playwright | **[TESTS.md](./TESTS.md)** |
| Roadmap par app | **[ROADMAP.md](./ROADMAP.md)** |
| Performances, stack, diagnostic, exports Profiler / Chrome | **[PERFORMANCES.md](./PERFORMANCES.md)** |
| Index de tout `docs/` | **[README.md](./README.md)** |

## Priorités actuelles

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
- **Mail** : alias boîte, polling, menu message — OK. **Sync par boîte** — **PLAN §9**. **Dossiers spéciaux** — **SYNC-BACKLOG §0b** + migration **23**. **En-têtes MIME complets** : liens mail/URL cliquables en cours d’itération UX. **Actions “Nouveau/Recharger/Étiquettes”** : déplacées dans la colonne gauche entre “Boîtes mail” et “Dossiers” ; à finaliser côté responsive/collapsed. **Notifications hors page Mail (web)** : livrées via watcher global AppLayout. Suite : archivage PG / quota OVH, règles, push (**SYNC-BACKLOG §1**). **Console / favicons** : **PLAN** §1–5.
- **Mobile Mail** : **sync in-app périodique + bannière nouveaux messages** livré ; login mobile simplifié (**email + mot de passe**, gateway auto, affichage mot de passe, bouton inscription). Reste **notifications push système** (FCM/APNs + Linux desktop app), brouillon IMAP, PJ inline avancé, et **pilotage admin ON/OFF de l’auto-inscription** (politique sécurité).
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
