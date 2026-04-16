# CLOUDITY — Roadmap produits et transversal

**Rôle de ce fichier** : catalogue **vivant** de tout ce que nous voulons construire — **applications visibles** (web / mobile) et **piliers invisibles** (sécurité, infra, API). Chaque nouvelle app ou domaine doit pouvoir être **ajouté ici** avec la même structure.

**Documents liés** :
- **[STATUS.md](../STATUS.md)** — suivi au jour le jour, checklist technique, § 0b (monorepo front).
- **[MOBILES.md](./MOBILES.md)** — matrice **web vs mobile** par produit + **admin mobile**.
- **[TESTS.md](./TESTS.md)** — toute entrée marquée « livré » doit idéalement avoir des tests (`make test` / E2E).
- **[PlanImplementation.md](./PlanImplementation.md)** — phases long terme, métriques, ressources.
- **[README.md](./README.md)** (ce dossier) — index des guides thématiques (éditeur, architecture front, évolution plateforme, sécurité approfondie, TODO dev).
- **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** — backlog opérationnel sync web/mobile, `make run-mobile`, session, archivage mail (complète **TR-07**).

**Comment ajouter une application** : copier le **modèle vierge** en fin de document, remplir les champs, ajuster l’ID (ex. `APP-NN`), cocher le statut.

**Légende statut** : `Non démarré` | `En cours` | `MVP` | `Complet` | `Reporté`

---

## Transversal — hors écran « application »

Ces blocs concernent **toute la plateforme** (backend, gateway, données, ops). Ils ne sont pas une « app » utilisateur mais conditionnent toutes les apps.

### TR-01 — Sécurité et chiffrement

| Champ | Contenu |
|--------|---------|
| **Description** | Politique globale : confidentialité des données au repos et en transit, gestion des secrets, menaces couvertes. |
| **Objectif** | Niveau de confiance équivalent ou supérieur aux suites grand public (chiffrement au repos applicatif, secrets, option E2E par produit). |
| **Plateformes** | Tous les services backend, Postgres, Redis, backups, clients (web, mobile). |
| **À quoi ça sert** | Réduire l’impact d’une fuite DB, d’un accès disque, d’une interception ; alignement RGPD / bonnes pratiques. |
| **Fonctionnement (cible)** | TLS 1.3 partout ; mots de passe Argon2id ; JWT RS256 ; **secrets** (mots de passe IMAP, OAuth) chiffrés côté serveur avec clé dédiée ; **données sensibles** (ex. corps mail, métadonnées Drive selon choix produit) : chiffrement au repos avec enveloppe / KMS ou E2E côté client pour Pass et options futures. |
| **Fonctionnalités / livrables** | Cartographie des données sensibles par service ; chiffrement champs (mail bodies, etc.) ; rotation de clés ; politique de rétention ; audit logs ; durcissement headers HTTP ; revue dépendances (`make test-security`). |
| **Statut** | En cours (partiel : auth, secrets mail). |
| **Liens** | STATUS § 2.3 chiffrement ; backends `auth-service`, `mail-directory-service`. |

### TR-02 — Infrastructure et déploiement

| Champ | Contenu |
|--------|---------|
| **Description** | Docker Compose (dev), puis prod : reverse proxy, TLS, scaling. |
| **Objectif** | Environnements reproductibles ; passage en prod sans refonte. |
| **Plateformes** | Linux serveur, CI, éventuellement K8s (voir PlanImplementation). |
| **Fonctionnement** | `make up`, migrations DB, healthchecks, variables d’environnement documentées. |
| **Fonctionnalités** | Nginx / Traefik / NPM ; certificats Let’s Encrypt ; backups DB + fichiers Drive ; monitoring (métriques, logs centralisés). |
| **Statut** | MVP dev (Compose). |
| **Liens** | `docker-compose.yml`, STATUS § 4. |

### TR-03 — API unifiée (gateway)

| Champ | Contenu |
|--------|---------|
| **Description** | Point d’entrée unique : auth JWT, routage vers micro-services, CORS. |
| **Objectif** | Un seul `VITE_API_URL` côté clients ; isolation des services métiers. |
| **Fonctionnement** | `api-gateway` proxy `/auth/*`, `/admin/*`, `/mail/*`, `/drive/*`, etc. ; en-têtes `X-User-ID`, `X-Tenant-ID`. |
| **Fonctionnalités** | Rate limiting ; liste CORS multi-origines (apps front séparées, § STATUS 0b) ; documentation OpenAPI (cible). |
| **Statut** | MVP. |
| **Liens** | `backend/api-gateway`. |

### TR-04 — Authentification et comptes

| Champ | Contenu |
|--------|---------|
| **Description** | Inscription, login, refresh, 2FA TOTP, sessions. |
| **Objectif** | Une identité Cloudity pour toutes les apps. |
| **Plateformes** | Web, mobile (même API). |
| **Fonctionnalités** | Résolution tenant par email (cible) ; SSO / OIDC (plus tard) ; politique mot de passe. **Session longue** : refresh token 30 j (rotation) ; JWT d’accès configurable via `ACCESS_TOKEN_DURATION_MINUTES` (défaut **60** en Docker) ; front : rafraîchissement proactif + **au retour sur l’onglet** (`visibilitychange`) pour compenser les timers ralentis en arrière-plan. |
| **Statut** | MVP (2FA, refresh). |
| **Liens** | `auth-service`, `docker-compose.yml` (env auth), `authContext.tsx`. |

### TR-05 — Architecture front (monorepo multi-apps)

| Champ | Contenu |
|--------|---------|
| **Description** | Plusieurs produits front dans le même dépôt, packages partagés, admin séparé. |
| **Objectif** | Éviter le fourre-tout ; réutiliser auth + client API. |
| **Fonctionnalités** | Workspaces npm ; packages `@cloudity/*` (noms à finaliser) ; app suite utilisateur vs `admin-console`. |
| **Statut** | Non démarré (voir STATUS § 0b, A1–A13). |

### TR-06 — Observabilité et qualité

| Champ | Contenu |
|--------|---------|
| **Description** | Tests automatisés, traces, logs structurés. |
| **Objectif** | Régressions visibles tôt. |
| **Fonctionnalités** | `make test`, Playwright, rapports ; logs corrélés request-id (cible). |
| **Statut** | En cours. |
| **Liens** | [TESTS.md](./TESTS.md) |

### TR-07 — Synchronisation des données (web + mobile, cible)

| Champ | Contenu |
|--------|---------|
| **Description** | Stratégie unifiée : quand et comment Drive, Mail, Calendar, Contacts, Photos, Pass se mettent à jour côté client et serveur, sans rechargement manuel si possible. |
| **Objectif** | UX proche des suites grand public : liste à jour, conflits maîtrisés, mobile aligné sur la même API. |
| **Mail (web actuel)** | Polling IMAP (~25 s, toutes les boîtes) + `invalidateQueries` : la **liste du dossier affiché** (réception, envoyés, brouillons, spam, corbeille, dossiers IMAP) se met à jour **sans F5**. **Brouillons** : pas d’instantané IMAP ; apparition après la prochaine sync qui lit **Drafts**. **Pas** de WebSocket mail pour l’instant. |
| **Mail (serveur — gros chantier)** | **Archivage Cloudity** : étendre la sync pour stocker en base (corps + PJ) au-delà de la fenêtre IMAP courante, politique de rétention, recherche — voir APP-01 + [SYNC-BACKLOG.md](./SYNC-BACKLOG.md) §1. |
| **Calendar / Contacts (web)** | **Fait (MVP)** : `refetchInterval` 60 s (calendriers + événements ; tâches overlay 90 s) + `refetchOnWindowFocus` — liste / grille à jour sans recharger comme le mail. **À faire** : rappels, invitations, CalDAV ; push mobile (FCM/APNs). **Drive / Photos** : Drive = focus produit (ROADMAP APP-02) ; Photos = placeholder. |
| **Pass** | E2E client ; sync coffres via API existante ; alias mail depuis Pass → lien APP-01 + API alias. |
| **Statut** | Partiel (Mail web avancé ; reste documenté ici pour implémentation progressive). |
| **Liens** | `MailPage.tsx`, services `*-service`, [SYNC-BACKLOG.md](./SYNC-BACKLOG.md), [MOBILES.md](./MOBILES.md) § 5–6. |

---

## Applications utilisateur (suite Cloudity)

### APP-01 — Mail

| Champ | Contenu |
|--------|---------|
| **Description** | Client mail web (et plus tard mobile) : boîtes externes IMAP/SMTP + fonctions hébergées Cloudity (domaines, alias, transferts). |
| **Objectif** | Remplacer ou compléter Gmail/Proton pour les utilisateurs Cloudity, avec contrôle tenant sur le mail. |
| **Plateformes visées** | Web (actuel `MailPage`) ; mobile (voir MOBILES.md). |
| **À quoi ça sert** | Lire, envoyer, organiser ; recevoir sur ses domaines ; protéger l’identité avec alias. |
| **Fonctionnement (résumé)** | Sync IMAP → métadonnées + corps en base à l’ouverture du message (évolution : **pré-télécharger / archiver** plus de messages côté serveur — voir ci-dessous) ; envoi SMTP/OAuth ; API `mail-directory-service` + gateway `/mail/*`. |
| **Fonctionnalités — déjà / en cours** | Multi-comptes ; sync dossiers INBOX / Sent / Drafts / Spam (backend) ; **UI** : rafraîchissement liste sans recharger la page pour le **dossier affiché** (polling + invalidateQueries) ; envoi ; alias par compte ; page Domaines admin ; détection auto IMAP/SMTP. |
| **Fonctionnalités — à faire (exhaustif cible)** | **Stockage serveur étendu** : conserver durablement dans PostgreSQL (corps, PJ) une copie des messages synchronisés pour dépasser les limites « vivantes » de la boîte d’origine et alimenter recherche / archivage (conception quota + confidentialité TR-01). **Domaines personnalisés** ; **transferts automatiques** ; **alias** avancés (dont création depuis **Pass** APP-04) ; catch-all ; filtres ; pièces jointes ↔ Drive ; full-text ; envoi différé ; threads ; **Mail Core** auto-hébergé si besoin. |
| **Backend** | `mail-directory-service` ; futur stack SMTP/IMAP si hébergement boîtes Cloudity. |
| **Statut** | MVP partiel (client IMAP externe riche). |

### APP-02 — Drive

| Champ | Contenu |
|--------|---------|
| **Description** | Stockage fichiers et dossiers hiérarchiques, partage interne (cible). |
| **Objectif** | Équivalent usage quotidien type Google Drive / Nextcloud. |
| **Plateformes** | Web ; mobile (MOBILES.md). |
| **Fonctionnalités** | Upload, download, arborescence, corbeille ; **aperçu** PDF/médias/texte/Office (modale) ; **vue Récents** (jour/heure, jusqu’à 500 nœuds) ; **à faire** : PDF.js, archives zip avancées, recherche, partage, quotas, chiffrement client optionnel (TR-01). |
| **Backend** | `drive-service`, `/drive/*`. |
| **Statut** | MVP. |

### APP-03 — Office (Documents / Tableur / Présentation)

| Champ | Contenu |
|--------|---------|
| **Description** | Éditeurs maison intégrés au Drive : document riche, tableur, slides. |
| **Objectif** | Produire et éditer sans dépendre d’un éditeur tiers (OnlyOffice, etc.). |
| **Plateformes** | Web ; mobile édition limitée ou viewer (MOBILES.md). |
| **Fonctionnalités** | TipTap / Luckysheet / slides ; export PDF, docx, xlsx, pptx ; menus type Office ; corbeille depuis l’éditeur. |
| **Statut** | En cours. |
| **Liens** | [editeur-docs.md](./editeur-docs.md), STATUS § 1b. |

### APP-04 — Pass (Password Manager)

| Champ | Contenu |
|--------|---------|
| **Description** | Coffres et entrées ; chiffrement E2E côté client (ciphertext côté serveur). |
| **Objectif** | Gestionnaire de secrets de confiance. |
| **Plateformes** | Web ; extension navigateur ; mobile (MOBILES.md). |
| **Fonctionnalités** | CRUD vaults/items ; **à faire** : auto-fill extension ; **création d’alias mail** depuis Pass (lien APP-01). |
| **Backend** | `password-manager`, `/pass/*`. |
| **Statut** | MVP web. |

### APP-05 — Calendar

| Champ | Contenu |
|--------|---------|
| **Description** | Agenda et événements ; vues jour / semaine / mois. |
| **Objectif** | Planification personnelle et d’équipe (cible). |
| **Plateformes** | Web ; mobile. |
| **Fonctionnalités** | CRUD événements ; **à faire** : rappels, invitations, **sync / rafraîchissement** harmonisé avec le web (polling ou push), sync externe (CalDAV), lien Mail/Tasks. |
| **Backend** | `calendar-service`, `/calendar/*`. |
| **Statut** | MVP. |

### APP-06 — Notes

| Champ | Contenu |
|--------|---------|
| **Description** | Prise de notes type Keep / bloc-notes enrichi. |
| **Objectif** | Capture rapide, organisation par couleurs / étiquettes. |
| **Plateformes** | Web ; mobile. |
| **Fonctionnalités** | CRUD ; **à faire** : cartes, couleurs, épinglage, rappels. |
| **Backend** | `notes-service`, `/notes/*`. |
| **Statut** | MVP. |

### APP-07 — Tasks

| Champ | Contenu |
|--------|---------|
| **Description** | Listes et tâches, dates d’échéance, répétition. |
| **Objectif** | Suivi des actions liées au calendrier et au mail. |
| **Plateformes** | Web ; mobile. |
| **Fonctionnalités** | Listes, tâches, répétition ; **à faire** : sous-tâches avancées, intégration Calendar. |
| **Backend** | `tasks-service`, `/tasks/*`. |
| **Statut** | MVP. |

### APP-08 — Contacts

| Champ | Contenu |
|--------|---------|
| **Description** | Carnet d’adresses partagé ou personnel (cible). |
| **Objectif** | Alimenter Mail, Calendar, téléphone. |
| **Plateformes** | Web ; mobile. |
| **Fonctionnalités** | CRUD contacts ; **à faire** : import/export vCard, doublons, liaison Mail, **sync mobile** (même API), éventuellement CardDAV. |
| **Backend** | À définir / service dédié (cible). |
| **Statut** | Non démarré (placeholder UI). |

### APP-09 — Photos

| Champ | Contenu |
|--------|---------|
| **Description** | Galerie, albums, métadonnées, lien stockage Drive ou objet. |
| **Objectif** | Expérience type Google Photos (auto-hébergée). |
| **Plateformes** | Web ; mobile. |
| **Fonctionnalités** | Upload, albums, partage ; **à faire** : reconnaissance faciale (opt-in), sauvegarde mobile. |
| **Backend** | À définir (métadonnées + référence fichiers Drive). |
| **Statut** | Non démarré (placeholder UI). |

### APP-10 — AppHub / Suite (accueil utilisateur)

| Champ | Contenu |
|--------|---------|
| **Description** | Tableau de bord d’entrée vers les apps, notifications unifiées (cible). |
| **Objectif** | Navigation cohérente type launcher Google. |
| **Plateformes** | Web (et shell mobile). |
| **Fonctionnalités** | Tuiles / liens ; historique visites ; **à faire** : recherche globale cross-apps. |
| **Statut** | MVP. |

---

## Applications et outils administrateur

### ADM-01 — Back-office web (admin-dashboard / future admin-console)

| Champ | Contenu |
|--------|---------|
| **Description** | Gestion tenants, utilisateurs, stats, domaines mail, vaults admin. |
| **Objectif** | Opérations d’administration sans mélanger avec l’UI grand public. |
| **Plateformes** | Web (route `/admin` aujourd’hui ; URL dédiée cible § STATUS 0b). |
| **Fonctionnalités** | Tenants, users, domaines, stats ; **à faire** : rôles fins, audit, séparation build `admin-console`. |
| **Backend** | `admin-service`, parties `/mail/domains` via gateway. |
| **Statut** | MVP. |

### ADM-02 — Application admin mobile

| Champ | Contenu |
|--------|---------|
| **Description** | Client mobile pour ADM-01 (actions courantes : utilisateurs, santé, alertes). |
| **Objectif** | Réagir depuis mobile sans poste fixe. |
| **Plateformes** | iOS, Android (Flutter ou natif — voir MOBILES.md). |
| **Fonctionnalités** | Login admin ; liste tenants/users ; notifications critiques ; **à préciser** selon besoins ops. |
| **Statut** | Non démarré. |

---

## Modèle vierge — copier pour une nouvelle entrée

```markdown
### APP-XX — Nom du produit

| Champ | Contenu |
|--------|---------|
| **Description** | |
| **Objectif** | |
| **Plateformes visées** | Web / iOS / Android / Desktop / Extension |
| **À quoi ça sert** | |
| **Fonctionnement (résumé)** | API / services concernés |
| **Fonctionnalités** | Liste pouvant évoluer |
| **Backend / services** | |
| **Dépendances** | Autres APP- ou TR- |
| **Statut** | Non démarré |
| **Liens** | Fichiers, issues |
```

---

*Fichier : **`docs/ROADMAP.md`**. Convention : les seuls Markdown à la **racine** du repo sont **`README.md`** (entrée) et **`STATUS.md`** (suivi) ; le catalogue produit vit ici. Dernière révision : 2026-04-13.*
