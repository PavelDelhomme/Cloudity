# Cloudity — Roadmap fonctionnel

## Fait récemment

- **Office** : page Suite Office avec **cartes colorées** (Nouveau document, Nouveau tableur, Nouvelle présentation) au lieu du menu déroulant.
- **E2E Playwright** : 15 tests exécutés, 5 skippés (création doc/dossier depuis le navigateur quand l’API Drive n’est pas joignable). `make tests` passe (phases 1, 2, 3, 4).
- **Contacts** : API dédiée (contacts-service), migration BDD, CRUD, page Contacts, suggestions dans Mail (champ À) à partir des contacts + destinataires récents.
- **Mail** : sync IMAP étendu (Boîte de réception, Envoyés, Brouillons, Spam) ; plusieurs fenêtres « Nouveau message » (pile de composes) avec barre réduite / agrandir / fermer par fenêtre.
- **Tests** : correction test App hub (texte « Choisissez une application par catégorie. »). `make test` / `make up-full` passent.

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

### 4. Contacts — suite et liaisons

- **Objectif** : renforcer la création / édition de contacts et les utiliser partout où on saisit un email ou on cible des personnes.
- **Pistes** :
  - Continuer l’UX de création/édition de contacts (formulaire, champs, validation).
  - **Liaison Notes** : pouvoir associer ou cibler des contacts depuis une note (ex. « participants », « à prévenir »).
  - **Liaison Événements** : voir ci‑dessous (invitations avec contacts/mail).
  - **Mail** : déjà en place (suggestions champ À à partir des contacts + récents) ; poursuivre l’intégration (CC, BCC, pièces jointes Drive).
- **Tests** : unitaires ContactsPage (CRUD, champs), E2E « créer contact, le voir dans les suggestions Mail ».

### 5. Événements (Calendrier) — invitations et partage

- **Objectif** : créer un événement et inviter des participants (même hors plateforme) en s’appuyant sur les contacts et le mail ; proposer le partage de fichiers/dossiers Drive.
- **Pistes** :
  - **Création d’événement** : formulaire avec titre, date/heure, lieu, description.
  - **Invitations** :
    - Récupération automatique des **contacts** (API contacts) et des **destinataires mail récents** pour proposer des participants.
    - Affichage **Nom, Prénom, email, infos de contact** pour mieux sélectionner quand on saisit un email ou qu’on choisit un contact.
    - Envoi d’invitation par **mail** (lien / ical) même si le destinataire n’a pas de compte sur la plateforme.
  - **Partage Drive** :
    - Lors de l’invitation (ou depuis l’événement) : proposer de **partager des fichiers ou dossiers Drive** (hors corbeille) avec les participants.
    - Partage **via mail** (lien de téléchargement / accès) ou **via compte plateforme** si le participant a un compte Cloudity.
  - **Partage photos** : à prévoir plus tard (galerie Photos liée à l’événement ou partage de dossier Photos).
- **Tests** : unitaires création événement, sélection contacts/emails, envoi invitation ; E2E « créer événement, ajouter participants depuis les contacts, envoyer invitation ».

### 6. Mail — suite

- **Objectif** : finaliser l’expérience mail (affichage Envoyés/Brouillons/Spam/Corbeille déjà en BDD), puis éditeur riche et envoi programmé.
- **Fait** : Dossiers dont Corbeille ; **menu d’actions** par message (bouton « Plus » + **clic droit**) : Déplacer vers la corbeille, Signaler comme spam, Remettre en boîte de réception selon le dossier ; **expéditeurs des mails reçus** : à l’ouverture d’un message, l’expéditeur est ajouté aux destinataires récents et sera proposé dans le champ À du compose.
- **Fait** : **sélection multiple** des mails (checkbox), **Tout sélectionner (page)**, **Inverser la sélection (page)**, actions en masse (lu / non lu / corbeille / spam / boîte de réception / **archiver**), pagination avec affichage `Page X / Y` et total (`N message(s)`).
- **À ajouter** : une option **“Tout sélectionner (boîte entière)”** (quand il y a plusieurs pages), distincte de “Tout sélectionner (page)”, pour permettre des actions de masse sur tous les mails (pas uniquement la page).
- **Pistes** :
  - **Notifications push** : à prévoir (notifications navigateur ou PWA quand un nouveau mail arrive).
  - **Éditeur riche** pour le corps du message (formatage type Gmail).
  - **Envoi programmé** (date/heure d’envoi).
  - Partage de fichiers Drive depuis le compose (liens ou pièces jointes), en cohérence avec la liaison Contacts / Événements.
  - **Dossiers personnalisés et hiérarchiques** : création dossier / sous-dossier / sous-sous-dossier, renommage, suppression, déplacement.
  - **Règles automatiques avancées** : conditions (expéditeur, destinataire, sujet, contenu, date, heure, tranche horaire, etc.) + actions (déplacer, marquer lu/non lu, spam, archive), avec application rétroactive sur la boîte existante.
  - **Recherche et filtres avancés** : combinatoires (AND/OR), période, pièces jointes, texte intégral.
  - **Édition complète d’un compte mail relié** : libellé, mot de passe, IMAP/SMTP, détection auto.
- **UX compte mail (spécifique sync)** : pendant la synchronisation, les champs **serveur IMAP/SMTP** doivent être en **lecture seule** (ou avec avertissement) ; idéalement l’édition doit se limiter à **mot de passe** (et éventuellement libellé), puis **re-sync** pour éviter de casser la synchronisation.
- **Tests** : unitaires MailPage (dossiers, compose), E2E « envoyer un mail, vérifier Envoyés ».

### 7. Office — édition collaborative (plus tard)

- **Objectif** : permettre à plusieurs utilisateurs de travailler ensemble sur un même document partagé (édition simultanée, modifications visibles en temps réel).
- **Pistes** :
  - Partager un document (lien ou droits) avec d’autres comptes plateforme.
  - Éditeur (document, tableur, présentation) avec **collaboration en temps réel** : curseurs, modifications concurrentes, résolution de conflits.
  - À traiter quand on travaillera en profondeur sur la partie Office / éditeurs.
- **Note** : cette évolution est à planifier après stabilisation des éditeurs et du partage Drive ; pas encore détaillée dans d’autres docs.

---

## Commandes utiles

- **`make test`** : tests unitaires / applicatifs (Go, pytest, Vitest).
- **`make tests`** : tout (test + test-e2e + test-e2e-playwright + test-security). Prérequis : `make up`, `make seed-admin`, attendre 20–30 s.
- **`make test-e2e-playwright`** : uniquement les E2E navigateur.

Les tests E2E skippés (création document, breadcrumb, suppression, sauvegarde éditeur) pourront être réactivés quand l’environnement E2E permettra les appels API Drive depuis le navigateur (gateway + drive-service joignables depuis le conteneur ou le host qui exécute Playwright).
