# Cloudity — Roadmap fonctionnel

## Fait récemment

- **Office** : page Suite Office avec **cartes colorées** (Nouveau document, Nouveau tableur, Nouvelle présentation) au lieu du menu déroulant.
- **E2E Playwright** : 15 tests exécutés, 5 skippés (création doc/dossier depuis le navigateur quand l’API Drive n’est pas joignable). `make tests` passe (phases 1, 2, 3, 4).

---

## À faire (priorités)

### 1. Notes — type Evernote / Keep / OneNote

- **Objectif** : blocs de notes, listes, mise en forme, utilisable et intégrable avec le reste (lien Drive, partage).
- **Pistes** :
  - Liste de notes (titre + extrait) avec création / édition / suppression.
  - Éditeur de note riche (blocs : titre, paragraphe, liste, checklist, code) ou Markdown.
  - Intégration Drive : option « Enregistrer dans le Drive » ou dossier dédié « Notes ».
  - Backend : notes-service (déjà en place) ; étendre le modèle (blocs, contenu riche) si besoin.
- **Tests** : tests unitaires NotesPage (liste, CRUD, blocs), E2E « créer une note, éditer, sauvegarder ».

### 2. Tâches — type Google Tasks + Calendrier

- **Objectif** : listes de tâches, tâches avec date/échéance, affichage dans l’Agenda.
- **Pistes** :
  - Listes de tâches (tasks-service) : listes + tâches avec titre, date d’échéance, complété.
  - Page Tâches : vue listes, ajout tâche, cocher complété, filtre par date.
  - **Intégration Calendrier** : dans la page Agenda, afficher les tâches avec échéance comme événements ou bloc « Tâches du jour ».
  - API : tasks-service expose déjà listes/tâches ; ajouter champ `due_date` si absent, et endpoint ou logique pour « tâches du jour » pour le calendrier.
- **Tests** : unitaires TasksPage (listes, tâches, date), E2E « créer tâche avec date, la voir dans l’Agenda ».

### 3. Photos — dossier Drive « Photos » auto

- **Objectif** : photos stockées dans un dossier Drive dédié, créé automatiquement, retrouvable (ex. « Photos » à la racine).
- **Pistes** :
  - À la première ouverture de la page Photos (ou au premier upload) : créer un dossier **Photos** à la racine du Drive (API drive-service) s’il n’existe pas.
  - Upload : envoyer les fichiers dans ce dossier (parent_id = id du dossier Photos).
  - Page Photos : galerie (grille ou liste) des nœuds du dossier Photos (filtrer par type image : .jpg, .png, .webp, etc.).
  - Optionnel : import « photos machine » = upload en masse depuis l’appareil vers ce dossier.
- **Tests** : unitaires PhotosPage (création dossier auto, liste, upload), E2E « ouvrir Photos, vérifier dossier Photos, téléverser une image ».

---

## Commandes utiles

- **`make test`** : tests unitaires / applicatifs (Go, pytest, Vitest).
- **`make tests`** : tout (test + test-e2e + test-e2e-playwright + test-security). Prérequis : `make up`, `make seed-admin`, attendre 20–30 s.
- **`make test-e2e-playwright`** : uniquement les E2E navigateur.

Les tests E2E skippés (création document, breadcrumb, suppression, sauvegarde éditeur) pourront être réactivés quand l’environnement E2E permettra les appels API Drive depuis le navigateur (gateway + drive-service joignables depuis le conteneur ou le host qui exécute Playwright).
