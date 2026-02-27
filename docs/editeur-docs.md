# Éditeur de documents maison (Drive)

Objectif : permettre d’ouvrir et d’éditer des documents (texte riche, tableur) depuis le Drive Cloudity avec **notre propre** front, sans OnlyOffice ni service tiers.

## Comportement actuel (implémenté)

- **Création de fichiers type Google Drive** : l’utilisateur choisit uniquement le type (Document / Tableur / Présentation). Le nom par défaut (« Sans titre », « Sans titre (1).html », etc.) et l’extension sont gérés par l’app — pas de saisie de nom avec `.html` visible.
- **Éditeur de documents** : page dédiée pour les fichiers `.txt`, `.md`, `.html` avec **sauvegarde automatique** toutes les 30 secondes si modifié, plus bouton « Enregistrer » pour sauvegarde manuelle.
- **Clic sur un fichier dans le Drive** : pour les types éditables (`.txt`, `.md`, `.html`), le **nom du fichier** est un lien vers l’éditeur ; le bouton « Éditer » ouvre aussi l’éditeur.
- **Page Suite Office** : libellés **Documents (éditeur maison)**, **Tableur (maison – à venir)**, **Présentation (maison – à venir)** et section **« Récemment modifiés »** (derniers fichiers en date, liens vers l’éditeur pour les types éditables).
- **API** : `GET /drive/nodes/recent?limit=N` renvoie les fichiers de l’utilisateur triés par `updated_at` DESC (auth requise).

## Principe (doc initiale)

- **Texte riche (type Word)** : éditeur intégré au front (ex. [TipTap](https://tiptap.dev/), ProseMirror). Fichiers stockés en JSON ou HTML dans le Drive ; ouverture/édition en page dédiée ou modal, sauvegarde via l’API Drive existante.
- **Tableur (type Excel)** : éditeur intégré (ex. [Luckysheet](https://github.com/dream-num/Luckysheet), [Handsontable](https://handsontable.com/), ou solution plus légère). Fichiers en JSON ou CSV ; même principe : ouvrir depuis le Drive, éditer, sauvegarder via l’API.
- **Aucun service Docker externe** : tout tourne dans l’app (admin-dashboard) et le drive-service existant.

## Étapes prévues

| # | Tâche | Détail |
|---|--------|--------|
| 1 | Choix des libs | TipTap (ou ProseMirror) pour le texte ; Luckysheet ou Handsontable pour le tableur. Dépendances npm uniquement. |
| 2 | Page / modal éditeur texte | Route ou modal « Éditer » depuis le Drive pour les fichiers texte (`.md`, `.html` ou type dédié). Chargement du contenu via API Drive, sauvegarde (PUT ou endpoint dédié). |
| 3 | Page / modal éditeur tableur | Idem pour les fichiers tableur (CSV ou JSON). Chargement → édition → sauvegarde. |
| 4 | Intégration Drive | Bouton « Éditer » (ou « Ouvrir avec ») sur les lignes de fichiers éditables dans la page Drive, qui ouvre l’éditeur avec le bon `nodeId`. |

## Références

- [TipTap](https://tiptap.dev/) — éditeur de texte riche (React, basé sur ProseMirror)
- [Luckysheet](https://github.com/dream-num/Luckysheet) — tableur open source (JavaScript)
- [Handsontable](https://handsontable.com/) — tableur (version open source disponible)

## Statut

- [x] Éditeur texte (contenteditable + barre d’outils) + sauvegarde Drive + **sauvegarde automatique**
- [x] Création de document sans saisie de nom (nom par défaut type Google Drive)
- [x] Bouton « Éditer » et **clic sur le nom du fichier** dans la page Drive → ouvre l’éditeur
- [x] Page Suite Office : **Documents / Tableur / Présentation (maison)** + **Récemment modifiés**
- [ ] Éditeur tableur + sauvegarde Drive
- [ ] Choix libs tableur (Luckysheet / Handsontable) si besoin

## À venir (prévision)

- **Visualiseur PDF maison** : prévisualisation des PDF dans le Drive (à faire nous‑même, ou avec une lib légère si besoin), intégré à l’app (popup/modal).
- **Prévisualisation de documents (type Google Drive)** : en cliquant sur un fichier non éditable (ex. PDF), ouvrir une vue prévisualisation — texte, HTML, images, PDF.
