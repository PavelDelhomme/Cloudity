# À faire (Cloudity)

## Priorités actuelles

- **En cours** : **OnlyOffice** — édition de documents (DOCX, XLSX, etc.) depuis le Drive. Document Server (Docker) + connecteur frontend (bouton « Éditer » sur les fichiers dans le Drive). Voir `docs/onlyoffice.md`.
- **Plus tard** : Administration (renforcer), Photos (galerie type Google Photos), Notes (type Google Keep, cartes, couleurs), Calendar (vue améliorée), Mail client riche, Contacts, etc.

## Problème résolu : crash HMR + lenteur au clic Téléverser

- **Crash "useUpload must be used within UploadProvider"** : l’overlay utilise `useContext(UploadContext)` et ne rend rien si le contexte est absent (HMR). `useUpload()` ne lance plus d’erreur (retourne une valeur par défaut si pas de provider).
- **Clic Téléverser lent / navigateur qui rame** : les inputs fichier/dossier sont maintenant montés **une seule fois** dans le layout (`DriveUploadInputs` dans `AppLayout`), plus recréés à chaque rendu du Drive. Les labels natifs pointent vers ces inputs stables. Quand tu quittes la page Drive, `driveParentId` est remis à `null`.
- **Chromium (Brave / Chrome) vs Firefox** : sous Chromium, les re-renders du composant qui contient l’input fichier peuvent bloquer ou ralentir l’ouverture du sélecteur. Un **contexte trigger stable** (`UploadTriggerContext`) avec une ref pour le parent courant évite tout re-render des inputs quand on change de dossier (breadcrumb) ; seuls les callbacks (ref mutée) sont mis à jour. Les inputs utilisent uniquement ce contexte, pas `driveParentId`, donc ils ne re-rendent pas.
- **Trace React Profiler (Drive)** : commits DrivePage ~5–10 ms, nombreux composants (File, Download, etc.) par ligne. Pour réduire la charge main thread sous Chromium : **startTransition** pour les mises à jour non urgentes (Nouveau dossier, breadcrumb, loadMore, listReady), **liste différée** (setTimeout 80 ms + startTransition) pour que la barre d’outils soit interactive tout de suite, **ligne mémoïsée** (`DriveNodeRow`) et callbacks stables pour limiter les re-renders.
- **Progression téléversement** : upload via XHR avec `onprogress` pour afficher un **pourcentage** (0–100 %) dans l’overlay et une barre de progression par fichier.

## Comment tracer une lenteur ou un gel (Performance)

1. **Chrome DevTools → Performance**  
   - Ouvre l’onglet Performance, clique sur Record (●).  
   - Dans l’app, clique sur « Téléverser » (ou fais l’action lente).  
   - Arrête l’enregistrement après l’action.  
   - Regarde la timeline : tâches longues (Main thread), re-renders React (si React DevTools Profiler est enregistré), Layout/Paint.

2. **React DevTools → Profiler**  
   - Onglet Profiler, puis Record.  
   - Reproduis le clic / l’action.  
   - Arrête et regarde quels composants ont rendu et combien de temps ils ont pris (flamegraph).

3. **Réduire la charge**  
   - Moins de composants qui re-rendent (inputs stables dans le layout, pas dans la page Drive).  
   - Moins de nœuds dans la liste (pagination / virtualisation si beaucoup de fichiers).

## Tests Drive (Téléverser, Dossier, Nouveau dossier)

- **Unitaires (Vitest)** : `npm run test:drive` — chaîne complète avec AppLayout, simulation `change` sur les inputs fichier/dossier.
- **Boucle** : `RUNS=20 npm run test:drive:loop` — rapport dans `test-results-drive-loop.json`.
- **E2E (Playwright)** : `npm run test:e2e:drive` — contre l’app réelle (port 6001). Prérequis : `make up`, être connecté, puis depuis `frontend/admin-dashboard` : `npx playwright install chromium` (une fois), `BASE_URL=http://localhost:6001 npx playwright test e2e/drive.spec.ts`.

## Notifications

- **Calendar, Mail, Tasks** : envoyer des notifications sur l’appareil depuis le navigateur (en arrière-plan).
  - Piste : Web Push API (PushManager, Service Worker), avec backend pour envoyer les payloads.
- **Plus tard** : synchronisation des notifications avec l’app mobile native (même notifs sur navigateur et téléphone).

## Session / sécurité (fait)

- Refresh token automatique toutes les 10 min côté frontend.
- En cas de 401, tentative de refresh avant déconnexion.
- Refresh token backend : 30 jours, rotation à chaque refresh.
