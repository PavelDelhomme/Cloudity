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
- **Drive** : Récents, recherche **`?q=`** + API **`/drive/nodes/search`** ; suite E2E, ZIP/PPT serveur (**SYNC-BACKLOG §3b**, **TESTS**).
- **Éditeur** : **`docs/editeur-docs.md`**, **STATUS §1b** — LaTeX cible, TipTap / tableur.
- **Calendrier** : mois multi-agendas OK ; semaine/jour, invitations.
- **Contacts** : liste/fiche OK ; groupes, import/export. **Liaison Mail ↔ contacts** (règles, fiches liées) : à planifier **une fois le MVP Mail web** (liste, PJ, multi-boîtes) stabilisé.
- **Mail** : alias boîte, polling, menu message — OK. **Sync par boîte** — **PLAN §9**. **Dossiers spéciaux** — **SYNC-BACKLOG §0b** + migration **23**. **Nouveau message** : bouton dans l’en-tête à côté de **+ Ajouter une boîte** (plus de bouton flottant sur la liste). Suite : archivage PG / quota OVH, règles, push (**SYNC-BACKLOG §1**). **Console / favicons** : **PLAN** §1–5.
- **Mobile Mail** : **MOBILES.md** / **BACKLOG** — brouillon IMAP, PJ inline, FCM.
- **Mobile** : `scripts/run-mobile.sh`, **`FLUTTER_ROOT`** (voir **MOBILES.md** §5).
- **Performances (chantier à industrialiser)** : état des lieux et pistes dans **PERFORMANCES.md** ; cible **ROADMAP TR-06** (métriques runtime, Web Vitals par route, `pprof` Go sous contrôle, profil Flutter) — toujours compatible **SECURITE.md** et une UX fluide.

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
