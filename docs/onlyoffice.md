# OnlyOffice — édition de documents depuis le Drive

Objectif : permettre d’ouvrir et d’éditer des fichiers Office (DOCX, XLSX, ODP, etc.) depuis le Drive Cloudity, dans le navigateur (type Nextcloud / OnlyOffice).

## Principe

1. **OnlyOffice Document Server** : service Docker qui fournit l’éditeur (Document Editor, Spreadsheet, Presentation). Il charge le document via une URL fournie par notre backend et enregistre les modifications via un callback.
2. **Backend (drive-service ou gateway)** : 
   - Endpoint pour **servir le fichier** à Document Server (avec token ou secret pour que seul Document Server puisse accéder).
   - Endpoint **callback** pour recevoir les sauvegardes (Document Server envoie le fichier modifié en POST).
3. **Frontend (admin-dashboard)** : sur la page Drive, pour les nœuds de type fichier éditables (DOCX, XLSX, etc.), afficher un bouton **« Éditer »** qui ouvre l’éditeur OnlyOffice en iframe (ou nouvel onglet) avec l’URL de configuration attendue par l’API OnlyOffice.

## Étapes prévues

| # | Tâche | Détail |
|---|--------|--------|
| 1 | Document Server dans Docker | Service **onlyoffice** ajouté au `docker-compose` (profil `onlyoffice`). Port **6085**. Démarrer avec : `docker compose --profile onlyoffice up -d`. JWT désactivé en dev. |
| 2 | Endpoints backend | Route (ex. `/drive/nodes/:id/edit-info`) qui retourne la config OnlyOffice : `document.url` (URL de téléchargement du fichier avec token), `document.key` (clé unique par version), `callbackUrl` (où Document Server envoie les sauvegardes). Route callback pour recevoir le fichier sauvegardé et mettre à jour `drive_nodes`. |
| 3 | Frontend Drive | Bouton « Éditer » (ou « Ouvrir avec ») sur les fichiers dont le type est éditable (extension ou mime). Ouvrir l’éditeur en iframe avec l’URL générée par le backend (ou page dédiée `/app/drive/edit/:id`). |

## Références

- [OnlyOffice Document Server - Docker](https://github.com/ONLYOFFICE/Docker-DocumentServer)
- [OnlyOffice API - Document Editor](https://api.onlyoffice.com/editors/basic)
- Intégration type Nextcloud : le backend expose une URL de document + callback ; le frontend affiche l’iframe avec `config` (document, editorConfig, width, height).

## Statut

- [x] Service Docker OnlyOffice (profil `onlyoffice`, port 6085)
- [ ] Backend : endpoint edit-info + callback sauvegarde
- [ ] Frontend : bouton Éditer + page/iframe éditeur
