# Cloudity Photos — produit, API et feuille de route

**Objectif** : offrir une expérience proche de **Google Photos** (chronologie, sauvegarde, albums, partage) **auto-hébergée** sur Cloudity, en **réutilisant le stockage Drive** pour éviter la duplication de blobs tant qu’un stockage objet dédié n’est pas nécessaire.

**Branche de travail actuelle (galerie optimisée, mobile, sync, sécurité)** : `feat/photos-gallery-mobile-sync-security` (ouverte depuis `dev`). Voir [BRANCHES.md](./BRANCHES.md).

**Documents liés** : [ROADMAP.md](./ROADMAP.md) (**APP-09**, **TR-07**), [SYNC-BACKLOG.md](./SYNC-BACKLOG.md) § 3, [MOBILES.md](./MOBILES.md).

---

## 1. Principes produit (alignement Google Photos)

| Fonctionnalité | Comportement cible | État Cloudity |
|----------------|-------------------|---------------|
| **Bibliothèque unique** | Toutes les images visibles en une chronologie | **MVP** : vue transverse sur les fichiers image du Drive (`GET /drive/photos/timeline`) |
| **Sauvegarde** | Téléversement depuis téléphone / web | **Web** : upload vers la racine Drive depuis Photos ; **mobile** : à faire (WorkManager, voir § 5) |
| **Albums / regroupements** | Albums utilisateur, « lieux », dates | **À faire** : tables métadonnées ou dossiers Drive dédiés + API |
| **Partage** | Liens, albums partagés | **À faire** (alignement APP-02 partage Drive) |
| **Corbeille** | Suppression réversible | **Réutilise** la corbeille Drive (`deleted_at`) |
| **Recherche / visages** | Opt-in, respect vie privée | **Hors MVP** ; documenter TR-01 avant toute ML |

---

## 2. API (drive-service)

| Méthode | Chemin | Rôle |
|---------|--------|------|
| `GET` | `/drive/photos/timeline` | Liste paginée des **fichiers image** de l’utilisateur (tous dossiers), tri **récent en premier** (`COALESCE(updated_at, created_at)`). Query : `limit` (défaut 48, max 200), `offset`. Réponse : `{ items, limit, offset, has_more }`. |

**Filtre image** : `mime_type` commence par `image/` **ou** extension reconnue (jpg, png, webp, heic, avif, tiff, …).

**Authentification** : même mécanisme que le reste du Drive (JWT gateway → en-têtes utilisateur).

**Client web** : `fetchDrivePhotosTimeline` dans `frontend/admin-dashboard/src/api.ts`.

---

## 3. Application web (`PhotosPage`)

- Grille de vignettes, **lightbox** (flèches, Échap), lien vers **Drive** pour organisation des dossiers.
- **Rafraîchissement** : `refetchInterval` 60 s + focus (alignement TR-07 avec Calendar / Contacts).
- **Upload** : `POST /drive/nodes/upload` (racine `parent_id` absent).

**Pistes UX suivantes** : regroupement par jour, sélection multiple, envoi vers album, corbeille depuis Photos.

---

## 4. Application mobile (Flutter)

**Statut** : scaffold cible `make run-mobile APP=Photos` (voir [MOBILES.md](./MOBILES.md)).

**Phases** :

1. Liste timeline + détail image (même API).
2. Sauvegarde album appareil → upload incrémental.
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
