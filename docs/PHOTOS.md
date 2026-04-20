# Cloudity Photos — produit, API et feuille de route

**Objectif** : offrir une expérience proche de **Google Photos** (chronologie, sauvegarde, albums, partage) **auto-hébergée** sur Cloudity, en **réutilisant le stockage Drive** pour éviter la duplication de blobs tant qu’un stockage objet dédié n’est pas nécessaire.

**Branche de travail actuelle (galerie optimisée, mobile, sync, sécurité)** : `feat/photos-gallery-mobile-sync-security` (ouverte depuis `dev`). Voir [BRANCHES.md](./BRANCHES.md).

**Documents liés** : [ROADMAP.md](./ROADMAP.md) (**APP-09**, **TR-07**), [SYNC-BACKLOG.md](./SYNC-BACKLOG.md) § 3, [MOBILES.md](./MOBILES.md).

---

## 1. Principes produit (alignement Google Photos)

| Fonctionnalité | Comportement cible | État Cloudity |
|----------------|-------------------|---------------|
| **Bibliothèque unique** | Toutes les images visibles en une chronologie | **MVP** : `photos-service` → **`GET /photos/timeline`** (lecture `drive_nodes`, même DB que Drive) |
| **Sauvegarde** | Téléversement depuis téléphone / web | **Web** : upload + **glisser-déposer** racine Drive ; **mobile** : `mobile/photos` (session) ; **WorkManager** à faire (§ 5) |
| **Albums / regroupements** | Albums utilisateur, « lieux », dates | **Web** : onglet **Albums** = dossiers racine Drive (MVP) ; **À faire** : tables métadonnées / albums natifs + API |
| **Partage** | Liens, albums partagés | **À faire** (alignement APP-02 partage Drive) |
| **Corbeille** | Suppression réversible | **Réutilise** la corbeille Drive (`deleted_at`) |
| **Recherche / visages** | Opt-in, respect vie privée | **Hors MVP** ; documenter TR-01 avant toute ML |

---

## 2. API (`photos-service` + gateway)

| Méthode | Chemin (via **api-gateway** `6080`) | Rôle |
|---------|-------------------------------------|------|
| `GET` | **`/photos/timeline`** | Liste paginée des **fichiers image** (`drive_nodes`), tri récent d’abord. Query : `limit` (défaut 48, max 200), `offset`. Réponse : `{ items, limit, offset, has_more }`. |

**Service** : `photos-service` (port **8057** dans Docker, health `GET /health`). Routage gateway : préfixe **`/photos`** → `photos-service`. Variable optionnelle : `PHOTOS_SERVICE_URL` sur la gateway.

**Compat** : `drive-service` conserve encore `GET /drive/photos/timeline` (même logique) pour outils anciens ; le **client web** et les **nouveaux clients** doivent utiliser **`/photos/timeline`** pour éviter les confusions de déploiement.

**Filtre image** : identique au Drive (mime `image/*` ou extensions usuelles).

**Authentification** : JWT → `X-User-ID` / `X-Tenant-ID` (comme Calendar / Drive).

**Client web** : `fetchDrivePhotosTimeline` dans `api.ts` appelle **`/photos/timeline`**.

---

## 3. Application web (`PhotosPage`)

- Grille de vignettes (colonnes type Google Photos), **lightbox** (flèches, Échap), **regroupement par jour** avec en-têtes **sticky**.
- **Glisser-déposer** : déposer des fichiers image sur la page (onglet **Chronologie**) → upload racine Drive (même flux que le bouton Importer).
- **Navigation** (`?tab=`) : **Chronologie** | **Albums** (dossiers racine Drive, lien vers Drive avec fil d’Ariane) | **Archivé** / **Verrouillé** (guidage + roadmap ; pas d’API dédiée encore) | **Corbeille** (lien vers `/app/drive?view=trash`).
- **État synchro** : libellé relatif basé sur le dernier `dataUpdatedAt` de la requête timeline + indicateur « mise à jour… ».
- **Rafraîchissement** : `refetchInterval` 60 s + focus.
- **Upload** : `POST /drive/nodes/upload` (racine `parent_id` absent).

**Suite** : sélection multiple, albums métier (API), corbeille « photos uniquement » côté serveur si besoin.

---

## 4. Application mobile (Flutter)

**Statut** : projet **`mobile/photos`** — timeline via `GET /photos/timeline` (champs URL gateway + JWT, voir `mobile/photos/README.md`). Lancement : **`make run-mobile APP=Photos`** (ADB : premier appareil `device`, ou `CLOUDITY_DEVICE_ID`).

**Phases** :

1. **Fait (base)** : liste des noms / ids depuis l’API.
2. Vignettes, login intégré (refresh), upload, WorkManager.
3. **Sync** : curseur serveur (`offset` / futur curseur opaque) + cache local SQLite (optionnel).

---

## 5. Batterie et arrière-plan (objectif « mieux que Google Photos »)

Google Photos s’appuie sur des **jobs système** (iOS BGProcessing, Android WorkManager) avec contraintes réseau et charge. Pour Cloudity, la cible documentaire est :

- **Ne pas** scanner la galerie en boucle : **WorkManager** avec intervalle minimal raisonnable (ex. 15 min+), **uniquement si** « sauvegarde Cloudity » activée.
- **Contraintes** : `requiresCharging` optionnel côté utilisateur ; `requiresBatteryNotLow` ; upload **uniquement en Wi‑Fi** si l’utilisateur coche l’option.
- **Batching** : files d’attente d’upload par petits lots ; pas de re-téléchargement des miniatures déjà en cache (ETag / `updated_at` côté futur index).
- **Pas de wake lock** prolongé ; reprise après `FAILED` réseau.

Ces règles seront détaillées dans **MOBILES.md** au fur et à mesure de l’implémentation.

---

## 6. Ordre de livraison (priorité produit actuelle)

1. **API** timeline + filtres image (**fait** : timeline de base).
2. **Web** galerie + upload + lightbox (**MVP en cours**).
3. **Mobile** lecteur + upload + WorkManager.
4. **Sync** web ↔ mobile (même source de vérité API).
5. **Perf** : miniatures serveur (redimensionnement) ou génération côté client limitée ; index EXIF (`taken_at`) en base pour un tri « date de prise » fidèle.

---

## 7. Suite produit (après Photos)

Ordre annoncé côté produit une fois Photos stabilisé : **Mail** (tri, alias, archivage) → **Contacts** → **Pass** (style Proton). Voir **ROADMAP** APP-01, APP-08, APP-04.

---

*Dernière mise à jour : 2026-04-11.*
