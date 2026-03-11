# Éditeur de documents maison (Drive)

Objectif : permettre d’ouvrir et d’éditer des documents (texte riche, tableur) depuis le Drive Cloudity avec **notre propre** front, sans OnlyOffice ni service tiers.

## Comportement actuel (implémenté)

- **Création de fichiers type Google Drive** : l’utilisateur choisit uniquement le type (Document / Tableur / Présentation). Le nom par défaut (« Sans titre », « Sans titre (1).html », etc.) et l’extension sont gérés par l’app — pas de saisie de nom avec `.html` visible.
- **Drawer (barre latérale)** : la navigation gauche peut être **masquée ou affichée** sur **tous les écrans** (bouton dans le header) ; état persisté en localStorage (`cloudity_sidebar_visible`).
- **Éditeur de documents** : page dédiée avec **fil d'Ariane** (lien Drive > nom du document), **bouton Renommer** à côté du titre, **barre de menus** (Fichier, Édition, Affichage, Insertion, Format, type Word/Google Docs) avec menus déroulants, **barre de formatage** en dessous (gras, italique, titres, listes, alignement, lien, citation, ligne horizontale, **insertion tableau**). Menu **Insertion** : lien, tableau, image (à venir), ligne horizontale, citation. Menu **Format** : Titre 1–3, paragraphe, listes, retrait/espacement et styles (à venir). Menu **Fichier** : Enregistrer, Télécharger (.docx), Déplacer vers…, Renommer, Supprimer, Fermer. **Mode Markdown** (bascule HTML ↔ MD via turndown/marked). Sauvegarde automatique 30 s + bouton Enregistrer.
- **Navigation et fermeture** : le fil d'Ariane **global** (barre du haut) affiche **Tableau de bord > Drive** (et non « Office > Éditeur ») quand on est dans l'éditeur. À la **fermeture** (bouton Fermer ou Fichier > Fermer) : si le document a été ouvert depuis la page **Office** (récemment modifiés, création), retour à `/app/office` ; si ouvert depuis le **Drive**, retour à `/app/drive` avec restauration du dossier (breadcrumb) où on était.
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
- [x] **Drawer** : barre nav gauche masquable (tous écrans, localStorage)
- [x] **Mode Markdown** : bascule éditeur riche ↔ source MD (HTML ↔ MD)
- [x] Page Suite Office : **Documents / Tableur / Présentation (maison)** + **Récemment modifiés**
- [x] Renommer depuis l'éditeur (bouton à côté du titre + modal ; aussi dans menu Fichier)
- [x] Supprimer depuis l'éditeur (menu Fichier + corbeille + redirection)
- [x] Barre de menus (Fichier, Édition, Affichage, Insertion, Format) + insertion tableau
- [x] **Modales maison** : **Lien** (Insertion > Lien → popup URL), **Tableau** (Insertion > Tableau → lignes/colonnes), **Quitter sans enregistrer** (Fermer avec modifications → Annuler / Quitter) — plus de `window.prompt` ni `window.confirm`
- [ ] Export PDF
- [ ] Éditeur tableur poussé ; Présentation .pptx
- [ ] Choix libs tableur (Luckysheet / Handsontable) si besoin

## Formats d'enregistrement et export (objectif)

| Type | Format d'édition | Enregistrement / export prévu |
|------|-------------------|------------------------------|
| **Document** | Éditeur riche (HTML) | Enregistrement direct **.docx** (déjà fait). Export **PDF** à ajouter. |
| **Tableur** | Grille (CSV / JSON) | Enregistrement **.xlsx** (déjà fait). Export **PDF** (optionnel). |
| **Présentation** | Éditeur riche + vue diapos (HTML, séparateurs H1/HR) | Enregistrement **.pptx** (à faire). Export **PDF** (à faire). Conversion vers d'autres formats plus tard. |

L'idée : comme pour document (.docx) et tableur (.xlsx), les **présentations** doivent pouvoir être **enregistrées en .pptx** dans le Drive (et téléchargement .pptx). Export **PDF** commun pour les trois types (document, tableur, présentation).

## Ordre des tâches Office/Éditeur (à faire étape par étape)

À enchaîner dans cet ordre. Après chaque étape : ajouter les tests (unit + E2E si pertinent), puis mettre à jour STATUS.md / ce fichier.

| # | Tâche | Détail | Tests |
|---|--------|--------|--------|
| 1 | **Renommer depuis l'éditeur** | Pouvoir renommer le document/fichier depuis la barre de l'éditeur (titre reflété dans le Drive). Déjà partiel pour .docx (sauvegarde renomme en .docx). Généraliser : champ éditable ou modal renommer pour tous les types. | Unit : renommage + sync ; E2E : ouvrir → renommer → vérifier Drive. |
| 2 | **Supprimer depuis l'éditeur** | Bouton **Supprimer** dans l'éditeur (avec confirmation) : envoi vers **corbeille** (ou suppression définitive si pas de corbeille). Puis redirection vers Drive ou Office. | Unit : action supprimer + redirection ; E2E : ouvrir doc → supprimer → retour. |
| 3 | **Export PDF** | Bouton **Exporter en PDF** dans l'éditeur (document, tableur, présentation). Génération côté client (ex. jsPDF, html2pdf) ou API. | Unit : génération ou appel export ; E2E : éditeur → Export PDF → téléchargement. |
| 4 | **Présentation → .pptx** | Enregistrement des présentations (contenu diapos HTML) en **.pptx** dans le Drive. Création « Nouvelle présentation » peut créer en .pptx dès le départ ou garder .html puis « Enregistrer en .pptx ». Téléchargement .pptx. | Unit : html/diapos → blob pptx ; E2E : créer présentation → éditer → enregistrer .pptx. |
| 5 | **Présentation : export PDF** | Même export PDF pour les présentations (vue diapos → PDF). | Inclus dans étape 3 ou spécifique. |
| 6 | **Améliorations progressives** | Enrichir l'éditeur (formatage, styles, tableaux), conversions (pptx → autres formats plus tard). | Tests au fil de l'eau. |

Les étapes 1 à 3 sont prioritaires (renommer, supprimer, export PDF). Ensuite 4–5 (présentation .pptx + PDF). On travaille **étape par étape** : une fois une étape validée (code + tests + doc), on passe à la suivante.

## À venir (prévision)

- **Visualiseur PDF maison** : prévisualisation des PDF dans le Drive (à faire nous‑même, ou avec une lib légère si besoin), intégré à l’app (popup/modal).
- **Prévisualisation de documents (type Google Drive)** : en cliquant sur un fichier non éditable (ex. PDF), ouvrir une vue prévisualisation — texte, HTML, images, PDF.
