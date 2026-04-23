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
| Index de tout `docs/` | **[README.md](./README.md)** |

## Priorités actuelles

- **Photos** : **`docs/PHOTOS.md`** — timeline, page web ; suite mobile, albums, EXIF, WorkManager.
- **Drive** : Récents, recherche **`?q=`** + API **`/drive/nodes/search`** ; suite E2E, ZIP/PPT serveur (**SYNC-BACKLOG §3b**, **TESTS**).
- **Éditeur** : **`docs/editeur-docs.md`**, **STATUS §1b** — LaTeX cible, TipTap / tableur.
- **Calendrier** : mois multi-agendas OK ; semaine/jour, invitations.
- **Contacts** : liste/fiche OK ; groupes, import/export.
- **Mail** : alias boîte, polling, corbeille IMAP, menu message — OK. **Sync par boîte** (icône ↻ dans la barre des boîtes, « Actualiser cette boîte », Paramètres « Sync maintenant ») — **PLAN §9**. Suite : archivage PG, règles, push (**SYNC-BACKLOG**). **Console / favicons** : **PLAN** §1–5.
- **Mobile Mail** : **MOBILES.md** / **BACKLOG** — brouillon IMAP, PJ inline, FCM.
- **Mobile** : `scripts/run-mobile.sh`, **`FLUTTER_ROOT`** (voir **MOBILES.md** §5).

## Tests : toujours valider **dans les conteneurs**

- **`make test`** : Go (`docker compose run --no-deps … go test`), **admin-service** (pytest en run ou exec), **admin-dashboard** (Vitest après `npm install` **dans l’image**). C’est la cible à viser avant merge ; évite les écarts de version Node / Go / libc entre ta machine et la stack.
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
