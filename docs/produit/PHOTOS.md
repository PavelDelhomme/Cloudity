# Cloudity Photos — produit, API et feuille de route

**Objectif** : offrir une expérience proche de **Google Photos** (chronologie, sauvegarde, albums, partage) **auto-hébergée** sur Cloudity, en **réutilisant le stockage Drive** pour éviter la duplication de blobs tant qu’un stockage objet dédié n’est pas nécessaire.

**Branche de travail actuelle (galerie optimisée, mobile, sync, sécurité)** : `feat/photos-gallery-mobile-sync-security` (ouverte depuis `dev`). Voir [BRANCHES.md](../operations/BRANCHES.md).

**Documents liés** : [ROADMAP.md](ROADMAP.md) (**APP-09**, **TR-07**), [SYNC-BACKLOG.md](SYNC-BACKLOG.md) § 3, [MOBILES.md](MOBILES.md).

---

## 1. Principes produit (alignement Google Photos)

| Fonctionnalité | Comportement cible | État Cloudity |
|----------------|-------------------|---------------|
| **Bibliothèque unique** | Toutes les images visibles en une chronologie | **MVP** : `photos-service` → **`GET /photos/timeline`** (tri **`taken_at`** puis `created_at` ; PDF exclus) |
| **Sauvegarde** | Téléversement depuis téléphone / web | **Web** : upload + **glisser-déposer** racine Drive ; **mobile Android** : WorkManager + `photo_manager`, Wi‑Fi/charge, choix des dossiers/albums locaux, upload vers Drive `Photos` |
| **Albums / regroupements** | Albums utilisateur, « lieux », dates | **Web** : onglet **Albums** = dossiers racine Drive ; ouverture d’un album → **`/app/photos?tab=albums&album=<id>`** (grille images + lightbox, retour liste). **À faire** : création d’album UI, tables métadonnées / albums natifs + API |
| **Partage** | Liens, albums partagés | **À faire** (alignement APP-02 partage Drive) |
| **Corbeille** | Suppression réversible | **Web** : onglet **Corbeille** = photos dans la corbeille Drive, **restauration** ; lien vers vue Drive complète. **À faire** : purge définitive depuis Photos |
| **Recherche / visages** | Opt-in, respect vie privée | **Hors MVP** ; documenter TR-01 avant toute ML |

---

## 2. API (`photos-service` + gateway)

| Méthode | Chemin (via **api-gateway** `6080`) | Rôle |
|---------|-------------------------------------|------|
| `GET` | **`/photos/timeline`** | Liste paginée des **fichiers image** (`drive_nodes`), tri récent d’abord. Query : `limit` (défaut 48, max 200), `offset`. Réponse : `{ items, limit, offset, has_more }`. |

**Service** : `photos-service` (port **8057** dans Docker, health `GET /health`). Routage gateway : préfixe **`/photos`** → `photos-service`. Variable optionnelle : `PHOTOS_SERVICE_URL` sur la gateway.

**Compat** : `drive-service` conserve encore `GET /drive/photos/timeline` (même logique) pour outils anciens ; le **client web** et les **nouveaux clients** doivent utiliser **`/photos/timeline`** pour éviter les confusions de déploiement.

**Filtre image** : mime `image/*` ou extensions usuelles ; **exclusion** `.pdf` et `application/pdf` (évite les faux positifs si MIME upload incorrect).

**Miniatures** : `GET /drive/nodes/:id/thumbnail?size=360` (drive-service, JPEG redimensionné, cache `private`). Décodage **HEIC/HEIF** via `goheif` si `image/jpeg`/`image/png` échouent. Les clients web/mobile doivent l’utiliser pour la grille ; le plein écran reste sur `GET /drive/nodes/:id/content?inline=1`.

**Date de prise** : colonne `drive_nodes.taken_at` ; envoyée à l’upload mobile (`asset.createDateTime`) ; repli parsing nom fichier côté serveur pour imports anciens.

**Authentification** : JWT → `X-User-ID` / `X-Tenant-ID` (comme Calendar / Drive).

**Client web** : `fetchDrivePhotosTimeline` dans `api.ts` appelle **`/photos/timeline`**.

---

## 3. Application web (`PhotosPage`)

- **Albums** : liste des dossiers racine ; clic → vue dossier (paramètre URL **`album`**). Cartes liste : mode clair / **sombre** avec bordures et dégradé léger pour éviter le « tout noir ».
- **Barre de navigation bas** : tons proches **Material / Google Photos** (fond `#1f1f1f` en sombre, onglet actif surligné bleu `#8ab4f8` / fond discret, inactifs gris `#9aa0a6`).
- Grille de vignettes (colonnes type Google Photos), **lightbox** (flèches, Échap), **regroupement par jour** avec en-têtes **sticky** : titre **large léger** (`Aujourd’hui` / `Hier` / date), **sous-ligne** jour complet pour contexte ; séparateur léger sous la date (alignement affichage type Google Photos web).
- **Glisser-déposer** : déposer des fichiers image sur la page (onglet **Chronologie**) → upload racine Drive (même flux que le bouton Importer).
- **Navigation** (`?tab=`) : **Chronologie** | **Albums** (dossiers racine Drive) | **Archivé** / **Verrouillé** (listes réelles serveur) | **Corbeille** (photos supprimées + restauration).
- **Archive / verrouillé** : colonnes `photo_archived_at` / `photo_locked_at` sur `drive_nodes` ; endpoints **`/drive/photos/archive`**, **`/unarchive`**, **`/lock`**, **`/unlock`** (POST groupé `{ ids }`) ; timeline **`/photos/timeline`** exclut archivé + verrouillé.
- **Coffre verrouillé (web)** : onglet **Verrouillé** protégé par **code PIN local** (4–8 chiffres, hash SHA-256 + sel) et **biométrie WebAuthn** optionnelle (empreinte / visage / Windows Hello). Aucun appel API ni vignette tant que le coffre n’est pas déverrouillé ; session courte (`sessionStorage`, ~15 min) ; reverrouillage à la sortie d’onglet ou changement d’onglet app. Chiffrement serveur dédié : prochaine étape.
- **Sélection** : coche **en haut à droite** de chaque vignette (Shift+clic pour plage) ; **clic sur la photo** ouvre toujours l’aperçu plein écran ; barre d’actions groupées dès qu’une photo est cochée ; clic droit (menu Archiver / Verrouiller / Corbeille).
- **Aperçu** : lightbox **plein viewport** (web `100dvh`, fond noir, barre titre en overlay) ; mobile viewer **plein écran** (`fullscreenDialog`, image `BoxFit.contain` sur toute la surface).
- **Paramètres Photos** : bouton en-tête, modal local (`photosAppSettings.ts`, localStorage) — taille grille, dates, confirmation archive/verrouillage.
- **Glisser-déposer** : import uniquement pour fichiers **externes** (pas de faux « téléversement » si on déplace une vignette déjà affichée).
- **État synchro** : libellé relatif basé sur le dernier `dataUpdatedAt` de la requête timeline + indicateur « mise à jour… ».
- **Rafraîchissement** : `refetchInterval` 60 s + focus.
- **Upload / affichage** : `POST /drive/nodes/upload` (racine `parent_id` absent) ; vignettes téléchargées avec concurrence limitée pour éviter le rate-limit gateway ; HEIC/HEIF/AVIF typés côté Drive/Web.

**Suite** : albums métier (API dédiée), indicateur **état sync par photo**, chiffrement coffre verrouillé serveur (H10 suite), changement de code PIN depuis Paramètres Photos.

---

## 4. Application mobile (Flutter)

**Statut** : projet **`mobile/photos`** — timeline via `GET /photos/timeline` (champs URL gateway + JWT, voir `mobile/photos/README.md`). Lancement : **`make run-mobile APP=Photos`** (ADB : premier appareil `device`, ou `CLOUDITY_DEVICE_ID`).

**Phases** :

1. **Fait (base)** : liste des noms / ids depuis l’API.
2. **Fait (MVP)** : login intégré (refresh), navigation mobile **Photos / Albums / Archivé / Corbeille / Verrouillé / Paramètres**, viewer plein écran (date en titre, retour grille à la photo courante, glisser bas pour fermer), corbeille Drive (suppression/restauration), verrou local par authentification système, upload Drive avec **`taken_at`**, WorkManager Android, réglages Wi‑Fi/charge et choix des dossiers locaux, vignettes via **`/thumbnail`** + file de chargement (anti-429), défilement horizontal par jour.
3. **Sync suivante** : scan complet paginé, curseur serveur (`offset` / futur curseur opaque), déduplication contenu (hash/taille/date), cache local SQLite (optionnel).
4. **Sécurité suivante** : vrai coffre Photos verrouillé côté serveur (masqué de la timeline, chiffrement dédié, migration/restore), puis action “Archiver” avec champ serveur pour masquer sans supprimer.

---

## 5. Batterie et arrière-plan (objectif « mieux que Google Photos »)

Google Photos s’appuie sur des **jobs système** (iOS BGProcessing, Android WorkManager) avec contraintes réseau et charge. Pour Cloudity, la cible documentaire est :

- **Ne pas** scanner la galerie en boucle : **WorkManager** avec intervalle minimal raisonnable (ex. 15 min+), **uniquement si** « sauvegarde Cloudity » activée.
- **Permissions Android** : `READ_EXTERNAL_STORAGE` jusqu’à Android 12, `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` sur Android 13, `READ_MEDIA_VISUAL_USER_SELECTED` sur Android 14+ ; l’activation de la sauvegarde demande la permission avant de planifier le job.
- **Contraintes** : `requiresCharging` optionnel côté utilisateur ; `requiresBatteryNotLow` ; upload **uniquement en Wi‑Fi** si l’utilisateur coche l’option ; choix des dossiers/albums Android à inclure (liste vide = toutes les photos).
- **Batching** : upload par petits lots ; marquage local des assets déjà envoyés ; pas de re-téléchargement des miniatures déjà en cache (ETag / `updated_at` côté futur index).
- **Pas de wake lock** prolongé ; reprise après `FAILED` réseau.

Ces règles seront détaillées dans **MOBILES.md** au fur et à mesure de l’implémentation.

---

## 6. Ordre de livraison (priorité produit actuelle)

Règle transversale **Cloudity** : **web d’abord, mobile ensuite** (toutes les apps) — **[MOBILES.md](MOBILES.md)** § **0**.

1. **API** timeline + filtres image (**fait** : timeline de base).
2. **Web** galerie + upload + lightbox (**MVP en cours**).
3. **Mobile** lecteur + upload + WorkManager.
4. **Sync** web ↔ mobile (même source de vérité API).
5. **Perf** : miniatures serveur (redimensionnement) ou génération côté client limitée ; index EXIF (`taken_at`) en base pour un tri « date de prise » fidèle.

---

## 7. Suite produit (après Photos)

Ordre annoncé côté produit une fois Photos stabilisé : **Mail** (tri, alias, archivage) → **Contacts** → **Pass** (style Proton). Voir **ROADMAP** APP-01, APP-08, APP-04.

---

*Dernière mise à jour : 2026-06-10.*
