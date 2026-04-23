# Backlog — synchronisation, mobile, session, mail serveur

**Priorités globales et tableau condensé** : voir d’abord **[../BACKLOG.md](../BACKLOG.md)** à la racine du dépôt. **Confiance / E2EE / sync / Zero Trust (cadre)** : **[SECURITE.md](./SECURITE.md)**.

Document de **travail** : tout ce que nous voulons faire sur la sync (web + mobile), les apps Flutter à scaffold, la session longue durée, et l’**archivage mail côté serveur**. Détail produit : **[ROADMAP.md](./ROADMAP.md)** (**APP-01** … **APP-10**, **TR-07**). Mobile : **[MOBILES.md](./MOBILES.md)**. Tests : **[TESTS.md](./TESTS.md)**.

**Branches Git** : intégration **`dev`**, chantiers **`feat/<sujet>`** (ex. `feat/photos-gallery-mobile-sync-security`), stable **`main`** — tableau domaine → branche : **[BRANCHES.md](./BRANCHES.md)**.

## 0c. HTTPS / TLS et durcissement (hors « tout-HTTPS localhost » sans design)

| Sujet | Rappel |
|--------|--------|
| **Dev (`http://localhost:6001`)** | Stack Docker classique en **HTTP** sur la machine ; suffisant pour développer. Passer le dashboard en **HTTPS** en local impose **certificats** (ex. **mkcert**) + config **Vite `server.https`** ou **reverse proxy** (Caddy) — à traiter comme chantier infra dédié, pas un toggle magique. |
| **Production** | TLS **1.2+** (idéalement **1.3**) en **terminaison** sur LB / ingress (**Traefik**, **Caddy**, **nginx**), en-têtes **HSTS**, cookies **Secure** / **SameSite**, pas de contenu actif **HTTP** sur pages **HTTPS**. Détail vision : **[SECURITE.md](./SECURITE.md)**. |
| **Détection de failles dans le dépôt** | Déjà : **`make test-security`** (npm audit, safety, **govulncheck** sur les services Go), checks auth. À étendre : **OWASP ZAP** / scan DAST sur stack déployée, **pinning** dépendances, politique **SLSA** — voir **[STATUS.md](../STATUS.md)** § « TLS & scans ». |
| **OpenClaw / ClawSecure** | Outils **tiers** orientés audit de *skills* / agents **IA** (OWASP ASI), ex. [ClawSecure OpenClaw](https://github.com/ClawSecure/clawsecure-openclaw-security) — **hors périmètre** du code applicatif Cloudity (Go + React) ; pertinent seulement si vous publiez des *skills* Cursor sensibles à auditer séparément. |

## Suite prioritaire (rappel)

| Domaine | Pistes |
|---------|--------|
| **Photos** | **Priorité actuelle** : microservice **`photos-service`** + **`GET /photos/timeline`** via gateway, galerie web, app **`mobile/photos`** (`make run-mobile APP=Photos`, ADB auto), puis sync + batterie — **[PHOTOS.md](./PHOTOS.md)**. **Drive** : app **`mobile/drive`** (liste fichiers MVP) — `make run-mobile APP=Drive`. |
| **Mail** | **Mobile** (`mobile/mail`) : multi-boîtes, dossiers, liste/détail, **PJ** (tap → fichier + **partage OS**), **envoi** minimal (`POST /mail/me/send`), **lu**, tests validation. **Brouillon IMAP sync** = backlog. Web : §0b, §8–10, §9 ; archivage §1. |
| **Pass** | MVP coffre + génération + alias (§2, **APP-04**) + tests API / web. |
| **Contacts** | §10, import / export, groupes, lien Mail ↔ fiches. |
| **Tests & mobile** | `make test` inclut **contacts-service** (`go test`). Vitest dashboard ; **`make tests`** phase 5 = **`test-mobile-suite`** (Flutter **Photos + Drive + Mail**). ADB + SDK inscriptible pour `integration_test` device — sinon **OK** après tests hôte (**TESTS.md** § 1b). **`CLOUDITY_SKIP_MOBILE_DRIVE`** / **`CLOUDITY_SKIP_MOBILE_MAIL`**. **`make run-mobile APP=Photos|Drive|Mail`**. Voir **MOBILES.md** § 5. |

---

## 0a. Compte Cloudity, Drive et plusieurs boîtes mail

- **Un utilisateur** (`users.id`, ex. `admin@cloudity.local` ou `pavel@gmail.com` après inscription) possède un **JWT** ; **Drive** et **Mail** utilisent le même `user_id`.
- Chaque boîte connectée est une ligne **`user_email_accounts`** (`user_id`, `email`, …). Plusieurs boîtes (ex. `candidatures@…`, Gmail perso) = plusieurs lignes pour le **même** `user_id` ; les messages sont en **`mail_messages.account_id`**.
- Aucune migration supplémentaire n’est requise pour « lier » Mail et Drive : c’est déjà le **compte Cloudity** commun. Un lien produit explicite (ex. dossier Drive par défaut par boîte) peut être ajouté plus tard si besoin.
- **Courriers « externes » pendant `make test`** : la suite de tests Cloudity **n’envoie pas** de vrais e-mails SMTP vers des boîtes OVH/Gmail. Si vous recevez un message (ex. plateforme emploi, Jobbingtrack, newsletter) sur `candidatures@…` au même moment qu’un `make test`, c’est en général une **coïncidence** ou un **autre service / projet** qui utilise la même adresse, un **webhook / relais** chez le fournisseur, ou simplement le **trafic réel** déjà présent sur le serveur IMAP que l’app synchronise. Vérifier les autres dépôts, les tâches cron et les règles de redirection du domaine.
- **En-têtes MIME bruts (`raw_headers`) — travail réalisé (à committer)** : colonne SQL migration `22-mail-raw-headers.sql`, extraction côté `mail-directory-service`, complément IMAP si le corps était déjà en base sans en-têtes. **IMAP** : le téléchargement RFC822 essaie désormais **chaque nom de boîte candidat** (Gmail « Sent Mail », OVH `INBOX.Sent`, etc.) jusqu’à obtenir un `BODY.PEEK[]` non vide, au lieu de s’arrêter au premier `SELECT` réussi. **Web** : la clé React Query du détail message inclut l’option « en-têtes complets » pour **refetch** à l’activation ; libellé **« Tous les dossiers »** pour l’agrégat `folder=all` (tous les dossiers de la **boîte sélectionnée** uniquement).

## 0z. Console navigateur (Mail web, Vite)

Les lignes **Vite**, les **CSS « Declaration dropped »** sur propriétés `-webkit-*` / `mso-*`, les **GET 200** vers `/mail/…`, et les **301 / 404** vers les services **favicon Google** sont en grande partie **normaux en dev** ou **bruit d’affichage HTML mail** — voir le guide **[PLAN.md](./PLAN.md)** (sections 1 à 5) avant de diagnostiquer une « erreur » bloquante. **Dates fausses en corbeille** : voir **PLAN §5** et correctif sync **`date_at`** dans **mail-directory-service**.

## 0. Réponses rapides (comportement actuel Mail web)

| Question | Réponse |
|----------|---------|
| **Sans recharger la page**, la liste se met à jour quand je reçois / envoie des mails ? | **Oui** pour le **dossier actuellement affiché** : polling IMAP (~25 s) sur toutes les boîtes + `invalidateQueries` + refetch TanStack Query. |
| **Boîte de réception, Envoyés, Brouillons, Spam** — même mécanisme ? | **Oui** : tu vois la liste du **dossier sélectionné** ; le polling sync **toutes** les boîtes puis rafraîchit la requête TanStack du dossier courant (`folder=inbox|sent|drafts|spam|trash|archive|…`). **Brouillons** : pas d’instantané côté IMAP ; tout nouveau brouillon **sur le serveur distant** apparaît après la prochaine sync qui lit **Drafts** (typ. ~25 s + latence). |
| **Corbeille** | **Sync IMAP** : le backend inclut **Trash** (`Trash`, `[Gmail]/Trash`, `Deleted Messages`, `Bin`, etc.) dans `syncAccountIMAP`, plus les messages passés en `trash` depuis l’app. |
| **« Temps réel »** | Ce n’est **pas** du WebSocket : **polling** + retour sur l’onglet. Suffisant pour un MVP ; push plus tard (TR-07). |

---

## 0b. Mail — à faire plus tard : sync **Envoyés, Brouillons, Archives, Spam, Corbeille** et **autres dossiers IMAP**

**Problème constaté** : selon la **boîte** (fournisseur, langue de l’interface, hébergement mutualisé, compte Google vs OVH vs Exchange, etc.), les courriers **Envoyés**, **Corbeille**, **Spam**, **Brouillons**, **Archives** ou équivalents peuvent vivre uniquement sous des **chemins IMAP non standard** (`INBOX.Trash`, `INBOX.Sent`, dossiers renommés, arborescence `Courrier indésirable`, etc.). La sync actuelle repose en partie sur des **listes fixes de noms de boîte candidats** côté backend (`syncAccountIMAP`, `imapMailboxCandidatesForDbFolder`), tandis que la découverte **`mail_imap_folders`** (LIST) n’est pas toujours **recollée** de façon fiable à ces dossiers « logiques » Cloudity (`sent`, `trash`, `spam`, …). Résultat : comportement **perçu comme incohérent** d’un compte à l’autre (ex. corbeille ou envoyés **non synchronisés** ou seulement visibles comme **dossier IMAP** à part sans être traités comme Trash/Sent).

**Pistes d’amélioration (backlog)** :

| Priorité | Travail |
|----------|---------|
| **Cartographie serveur** | Exploiter les attributs **SPECIAL-USE** (`\Sent`, `\Trash`, `\Drafts`, `\Junk`, `\Archive`) quand `LIST` les renvoie ; sinon étendre les heuristiques **par familles** de serveurs et journaliser le chemin retenu. |
| **Cohérence sync ↔ lecture** | Réutiliser une **même source de vérité** (chemins résolus par compte) pour `syncAccountIMAP`, le déplacement de messages et le fetch RFC822, afin d’éviter les écarts « sync ici mais pas là ». |
| **Dossiers IMAP « autres »** | S’assurer que les dossiers listés dans la barre latérale (hors inbox/sent/…) sont **inclus dans le cycle de sync** avec la même fréquence / les mêmes limites que les dossiers standard, ou documenter explicitement les exceptions. |
| **UX / confiance** | Afficher un **état de sync par dossier** (OK, partiel, chemin IMAP inconnu) ; option avancée : **lier manuellement** un chemin IMAP ↔ rôle Cloudity (Sent/Trash/…) pour les configurations exotiques. |
| **Qualité** | Jeux de réponses **IMAP LIST** capturées ou mocks pour les principaux fournisseurs ; tests de non-régression sur les mappings. |

À relier à **TR-07** (temps réel / fiabilité) et à l’**APP-01** (stockage étendu) si la sync doit devenir exhaustive avant l’archivage longue durée.

---

## 1. Mail — archivage longue durée sur PostgreSQL (priorité produit)

**Objectif utilisateur** : stocker **côté Cloudity** (base de données) une copie durable des messages (au-delà de la fenêtre IMAP actuelle ~300 derniers messages par dossier), pour recherche, historique et indépendance partielle vis-à-vis de la boîte d’origine.

| Étape | Travail |
|-------|---------|
| **Conception** | Politique de rétention, quotas par tenant, chiffrement au repos des corps (TR-01), impact légal / RGPD. |
| **Backend** | Étendre `syncAccountIMAP` (ou job planifié) : récupération incrémentale UID, stockage `body_plain` / `body_html` / métadonnées PJ sans tout re-télécharger à chaque sync. |
| **API** | Listes paginées déjà en place ; recherche full-text (index Postgres ou moteur dédié). |
| **Front** | Inchangé dans l’idée (même API) ; indicateurs « archivé Cloudity » si besoin UX. |

Voir **APP-01** dans ROADMAP (« Stockage serveur étendu »).

---

## 2. Pass ↔ alias mail

- **Aujourd’hui (web)** : `POST /mail/me/accounts/:id/aliases` avec `alias_email`, `label`, `deliver_target_email` (cible documentée : vers quelle boîte réelle le message doit aller — **Cloudity ne configure pas le DNS / MX** seul). `PATCH` sur le même alias pour mettre à jour la cible. Liste des messages : `delivered_to=<alias>` filtre sur le champ **À** (`to_addrs` en base), tandis que **sans filtre** = tout le dossier (principale + alias).
- **Tester les alias** : créer l’alias côté **fournisseur** (OVH, Google « adresse secondaire », etc.) pour que les mails arrivent bien dans l’**INBOX** IMAP de la boîte connectée ; dans Cloudity, **enregistrer** le même `alias_email` pour le filtre latéral et la traçabilité Pass.
- **DNS** : pour un domaine géré par Cloudity, les enregistrements MX / redirections restent côté **infra mail** (table `mail_aliases` domaine vs `user_email_aliases` par utilisateur) — à documenter par cas (self-host vs relais).
- **Pass (extension / app)** : même API + token utilisateur ; flux type Proton : création d’alias + **cible** en un appel — **APP-04** dans ROADMAP.

---

## 3. Calendrier, Contacts, Drive, Photos (web) — sync / priorisation

| App | État sync web | Travail prévu (parallèle au mail) |
|-----|----------------|-----------------------------------|
| **Calendar** | **`refetchInterval` 60 s** (calendriers + événements ; overlay tâches 90 s) + `refetchOnWindowFocus` + mutations | **À faire** : rappels, invitations, CalDAV (cible), lien Mail/Tasks, push. |
| **Contacts** | **`refetchInterval` 60 s** + `refetchOnWindowFocus` | **Import web** : CSV / JSON / HTML ; groupes, export vCard, **liaison Mail ↔ Contacts** (voir **§10**). |
| **Drive** | Idem | **Priorité produit** : corbeille, partage — voir APP-02 ; **aperçu navigateur** + **vue Récents** : § **3b** ; recherche nom sur **tout le Drive** : **`GET /drive/nodes/search`** + **`?q=`** non vide dans le dashboard (sinon filtre client sur le dossier courant). |
| **Photos** | **`refetchInterval` 60 s** + focus timeline (`fetchDrivePhotosTimeline` → **`/photos/timeline`**) | **Fait (MVP)** : **`photos-service`**, gateway `/photos/*`, page Photos web, Flutter **`mobile/photos`** (liste API + JWT). **À faire** : login mobile, vignettes, upload, WorkManager, albums, EXIF — **PHOTOS.md**. **Dossier verrouillé** (coffre biométrique mobile + équivalent web, hors timeline principale) : **§3c**. **Déploiement** : `docker compose up -d --build photos-service api-gateway` (ou `make up`) après mise à jour. |

Stratégie unifiée : **TR-07** dans ROADMAP.

### 3b. Drive — aperçu fichiers (PDF, médias, texte) dans l’UI

**Réalisé (état actuel)** : `GET /drive/nodes/:id/content?inline=1` retourne `Content-Disposition: inline` pour les types « affichables » (PDF, images, texte, audio, vidéo) ; sans `inline`, réponse en `attachment` pour les téléchargements classiques. **MIME** : déduction par **extension** et détection **magic `%PDF`** si la base a `application/octet-stream` ou vide. **Web** (`DrivePage`) : téléchargement d’aperçu avec `?inline=1`, **PDF** via `<embed type="application/pdf">`, **vidéo / audio** (`<video>` / `<audio>`), **miniatures** images avec coercition de type si besoin. **UX** : clic simple fichier = **aperçu** modale ; **Ctrl / Cmd / Maj** + clic = **sélection** ; dossier grille : **clic simple** ouvre (léger debounce), **double-clic** sélectionne ; liste dossier idem. **Office** : aperçu **lecture seule** (Word via mammoth → HTML, Excel `.xlsx/.xls/.xlsm` → tableau, présentations → diapos HTML, CSV → tableau, Markdown → HTML) + bouton **Éditer dans Office** (nouvel onglet) — **pas** d’iframe de toute l’app dans la modale. **PDF / blob** : les effets de chargement d’aperçu ne dépendent plus de la référence du **JWT** (ref `accessToken` dans les effets) pour éviter un **rechargement** de l’aperçu au simple retour de focus / refresh token. **Vue Récents** (bouton comme Corbeille) : API `GET /drive/nodes/recent?limit=…` jusqu’à **500** nœuds (fichiers **et** dossiers) ; front : **regroupement par jour civil puis par heure**, **vue grille ou liste** (même `DriveNodeCard` / `DriveNodeRow` que le Drive), bandeau racine élargi (24 entrées), `refetchOnWindowFocus: false` sur les requêtes « récents » pour limiter les secousses UI. **Recherche nom** : avec **`?q=`** non vide, le dashboard appelle **`GET /drive/nodes/search`** (tout l’arborescence, champ **`parent_folder_name`** pour le contexte) ; sans terme ou filtre local seul, la liste du dossier courant reste **`GET /drive/nodes`** (éventuellement filtrée côté client).

**À faire plus tard (backlog produit)** :

| Piste | Détail |
|-------|--------|
| **Office / tableurs** | **Conversion serveur** (LibreOffice headless) ou viewer tiers pour **ODS / ODT / ODP** et **PPT binaire** natif (au-delà du HTML stocké par l’éditeur) ; prévisualisation sans limite pratique côté client si besoin **streaming** ou tuiles serveur. |
| **Gros fichiers** | Aujourd’hui le contenu est en **bytea** : pas de streaming range ; prévoir **fichiers > ~50 Mo** (stockage objet + URL signée + `Accept-Ranges`). |
| **PDF.js** | Intégrer Mozilla **pdf.js** pour un rendu PDF homogène (zoom, recherche) si les navigateurs restreignent `blob:` + `object`. |
| **Sécurité** | Politique CSP stricte pour `srcDoc` HTML d’aperçu ; sandbox iframe déjà partiellement en place. |

### 3c. Photos — dossier verrouillé / coffre biométrique (type Google Photos)

**Besoin produit** : permettre de **déplacer** des photos (ou médias) vers un **espace sécurisé** distinct de la bibliothèque principale — comme le **dossier verrouillé** Google Photos — avec **accès conditionné** à une **preuve forte d’identité** sur l’appareil.

| Cible | Exigence |
|-------|----------|
| **Mobile (prioritaire)** | Accès au coffre via **biométrie** (empreinte digitale, reconnaissance faciale selon plateforme) : **Flutter** `local_auth` (Android BiometricPrompt / iOS LocalAuthentication). Option : **lier** l’ouverture du coffre à une **empreinte d’appareil** (clé matérielle, attestation, ou jeton d’appareil enregistré côté serveur — à cadrer avec **SECURITE.md** / Zero Trust). |
| **Web** | **Parité fonctionnelle** : pas de capteur biométrique dans le navigateur pour tous les utilisateurs ; prévoir **WebAuthn** (passkeys), **code PIN** session longue, ou **re-authentification** (mot de passe / 2FA) avant d’afficher le coffre. L’« empreinte d’appareil » côté web = combinaison **WebAuthn** + cookies limités ou **appareil enregistré** documenté en UX. |
| **Bibliothèque principale** | Les éléments rangés dans le coffre **ne doivent plus apparaître** dans la **timeline / grille** de la page Photos « normale » (filtrage API + index sync). Entrée produit dédiée : **« Dossier verrouillé »** / **« Coffre »** avec liste séparée. |
| **Backend / API** | Modèle de données dédié (ex. `photos_vault_items`, flag `storage_tier=vault`, ou dossier Drive réservé **chiffré** côté client — selon choix E2EE). **`GET /photos/timeline`** : exclure par défaut les IDs du coffre ; endpoint ou scope **`/photos/vault/...`** après authentification renforcée. **Sync mobile** : même exclusion dans les jobs de vignettes / WorkManager tant que le coffre n’est pas déverrouillé. |
| **Sécurité** | Chiffrement au repos, politique de **verrouillage** (timeout), pas de miniatures sensibles en cache disque non chiffré sans consentement — alignement **TR-01** / **SECURITE.md**. |

**Documents liés** : **[PHOTOS.md](./PHOTOS.md)**, **[MOBILES.md](./MOBILES.md)**, **[SECURITE.md](./SECURITE.md)** ; à référencer dans **ROADMAP** (ex. entrée **APP-Photos** ou extension **APP-01**) lorsque la conception sera priorisée.

---

## 4. Session utilisateur (longue durée, sans couper si l’utilisateur travaille)

| Mécanisme | Détail |
|-----------|--------|
| **Refresh token** | 30 jours côté `auth-service`, **rotation** à chaque refresh. |
| **JWT d’accès** | `ACCESS_TOKEN_DURATION_MINUTES` dans l’env du service auth (défaut **60 min**, plage 5–1440). |
| **Frontend** (`authContext.tsx`) | Renouvellement **toutes les 10 min** (timer) ; au **retour** sur l’onglet / **focus** fenêtre ; sur **activité** utilisateur (**pointerdown** / **keydown**, au plus toutes les **4 min** si l’onglet est visible). Cela limite les 401 en longue session active. |

Si la session coupe encore : augmenter `ACCESS_TOKEN_DURATION_MINUTES` (ex. 120) **ou** vérifier qu’aucun proxy ne tronque les cookies/headers.

---

## 5. Applications mobiles — `make run-mobile`

**Commande** (depuis la racine du repo, **Flutter** installé) :

```bash
# APP insensible à la casse ; guillemets optionnels sous shell
make run-mobile APP=Admin
make run-mobile APP=Drive
make run-mobile APP="Mail"
make run-mobile APP="Calendar"
make run-mobile APP="Contacts"
make run-mobile APP="Photos"
make run-mobile APP=Pass
```

- **Admin** → `mobile/admin_app` → `flutter run`.
- **Autres** → `mobile/<nom>` ou `mobile/<nom>_app` (ex. `mobile/mail`, `mobile/mail_app`) ; si absent → instructions `flutter create` + sortie code 2.

**Tester la sync** sur mobile : même **API gateway** (`VITE_API_URL` équivalent : `http://10.0.2.2:6080` sur émulateur Android, IP LAN sur appareil réel). `make run-mobile` ne remplace pas le **scaffold** Flutter : il lance ce qui existe.

Implémentation : **`scripts/run-mobile.sh`**.

---

## 6. Checklist de livraison (à cocher au fil du temps)

- [x] **Mail** : sync IMAP dossier **Trash** (corbeille UI + serveur).
- [ ] **Mail** : archivage étendu PostgreSQL (corps + politique rétention).
- [x] **Calendar (web)** : rafraîchissement automatique liste / événements (`refetchInterval` 60 s, sans F5).
- [x] **Contacts (web)** : rafraîchissement liste (`refetchInterval` 60 s).
- [ ] **Calendar** : rappels, invitations, CalDAV, push.
- [ ] **Contacts** : groupes avancés, export vCard, **§10** Mail × Contacts.
- [ ] **Drive** : parcours produit prioritaire (déjà MVP — extensions ROADMAP).
- [x] **Photos (web + API)** : **`photos-service`** + `GET /photos/timeline` + `PhotosPage` (galerie, upload, lightbox, tests Vitest) ; proxy Vite `/photos`.
- [ ] **Photos (mobile + sync + perf)** : auth intégré, vignettes, upload, **WorkManager**, miniatures / index EXIF ; **dossier verrouillé** (§3c) ; apps **Drive / Mail / Contacts / Calendar / Pass** mobile (scaffold + `run-mobile` + doc).
- [ ] **Pass** : création alias mail depuis l’UI Pass.
- [ ] **Mobile** : scaffold `drive_app`, `mail_app`, … + CI.
- [ ] **TR-07** : documenter choix push (FCM/APNs) quand applicable.
- [ ] **Mail** : recherche avancée + panneau filtres + historique (**§9**).
- [ ] **Mail × Contacts** : parcours liés + icônes / logs cohérents (**§10**).

---

## 7. Migration monorepo / multi-apps front

Toujours d’actualité : **[STATUS.md](../STATUS.md)** § **0b**, **[ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)**.

---

## 8. Backlog Mail avancé (dossiers IMAP personnalisés, règles, planification, push)

| Fonction | État | Notes |
|----------|------|--------|
| **Badges dossiers** (non-lus / totaux) | Fait (standard + extra) | `GET …/folders/summary` inclut `extra[]` pour les chemins IMAP hors lot inbox/sent/… ; liste arbo : `GET …/imap-folders` (après sync + `LIST`). |
| **Envoi depuis un alias** | Fait | Champ **De** dans la composition + `from_email` côté API (en-tête `From`, enveloppe SMTP = compte authentifié). |
| **Anti-spam (score)** | Par message / boîte | Calcul backend par message ; chaque boîte a ses propres `mail_messages`. |
| **Recherche / filtres type Gmail** | Partiel | Voir **§9** : aujourd’hui `recipient` / `delivered_to` + `tag_id` ; **pas** encore recherche plein texte, filtres structurés type `from:` / `has:attachment`, panneau d’aide, ni historique des requêtes. |
| **Règles / tri automatique** | À faire | Job + table de règles ; exécution après sync IMAP. |
| **Envoi planifié** | À faire | Table `scheduled_outbound_mail` + worker (cron/goroutine) + rester en brouillon jusqu’à l’heure. |
| **Notifications push Web** | À faire | Service Worker + Web Push (VAPID) + abonnements en base ; voir `docs/TODO.md`. |
| **App mobile Mail** | Scaffold | `make run-mobile APP=Mail` après `flutter create` ; voir `docs/MOBILES.md`. |
| **Pièces jointes (réception)** | Partiel (MVP) | Migration `21-mail-attachments-threads.sql` : `mail_message_attachments`, extraction au premier chargement du corps (RFC822), stockage **≤ 512 Ko** par PJ en base, sinon relecture IMAP au téléchargement. `GET …/messages/:msgId/attachments/:attId`. |
| **Conversations / fils** | Partiel | `thread_key` depuis `References` / `In-Reply-To` / `Message-ID` ; filtre liste `thread_key=` ; sync renseigne `internet_msg_id` / `in_reply_to`. **À faire** : vue thread unifiée type Gmail, résolution chaîne complète de parents, dédup cross-dossiers. |
| **Prévisualisation PJ** | À faire | Images/PDF inline dans l’UI ; bac à sable MIME ; **antivirus** avant stockage ou à la volée ; quotas par tenant. |
| **Stockage PJ avancé** | À faire | Object storage / Drive ; chiffrement ; déduplication par hash ; politique de rétention alignée archivage §1. |

---

## 9. Recherche mail avancée (type Gmail / Proton) — **à faire** (important)

**Constat** : la recherche « comme Gmail » ou « comme Proton Mail » **n’est pas réalisée** : pas de barre unifiée avec opérateurs, pas de panneau d’aide aux filtres, pas d’historique des termes.

| Sous-lot | Détail |
|----------|--------|
| **Backend** | Full-text Postgres (`tsvector` sur sujet + corps + expéditeurs) ou moteur dédié ; API unique `GET …/messages/search?q=` + traduction des opérateurs (`from:`, `to:`, `subject:`, `has:attachment`, plages de dates, `in:` dossier / étiquette). Cohérence multi-boîtes (`account_id`). |
| **Filtres structurés** | Parité d’intention avec Gmail/Proton (liste de champs + combinaisons AND/OR) ; documenter le sous-ensemble V1. |
| **UI — panneau / arbre** | Bouton pour **déplier un panneau** « Aide à la recherche » : arborescence ou sections (Expéditeur, Destinataire, Pièces jointes, Date, Dossier, Étiquette) qui **injecte** des tokens dans la requête ou des query params typés. |
| **Historique des recherches** | Suggestions sous la barre : **derniers termes** (localStorage, puis option compte serveur `user_search_history` si produit validé) ; effacer l’historique ; ne pas logger de données sensibles en clair côté analytics. |
| **Sauvegardes / vues** | Option ultérieure : recherches enregistrées ou « vues intelligentes » (comme dossiers dynamiques). |

Liens : **§1** (archivage + index), ligne **Recherche** du tableau §8.

---

## 10. Mail × Contacts — icônes, journaux, liaison produit — **à faire** (important)

**Constat** : enrichissement UX et **lien explicite** entre **Mail** et **Contacts** encore incomplet (pas d’icônographie unifiée dans tous les journaux, pas de parcours « fiche contact ↔ fil de mails » abouti).

| Sous-lot | Détail |
|----------|--------|
| **Icônes / avatar** | Même logique que dans Contacts : initiales ou avatar si un jour photo URL ; **même composant** liste Mail (expéditeur) et liste Contacts pour cohérence visuelle. |
| **Journaux / activité** | Où l’app expose une **timeline** ou des **logs** (admin, audit, ou « activité récente ») : **pictogrammes distincts** Mail vs Contacts (et autres apps) pour scanner visuellement ; libellés i18n. |
| **Mail → Contacts** | **Partiel (admin web)** : liste courrier avec **avatar / favicon domaine** (sans case à cocher par défaut) ; **appui long** ou menu **Sélectionner** ; menu **Ouvrir dans Contacts** / **Ajouter aux contacts** ; `/app/contacts?q=` préremplit la recherche. **À faire** : photo contact (`avatar_url` API), fiche ↔ fil de mails. |
| **Contacts → Mail** | Depuis une fiche : **Voir les échanges** (redirection Mail avec `recipient=` ou futur `contact_id=` si API dédiée). |
| **Données** | Réutiliser `GET /contacts` + corrélation par **adresse email** ; index côté mail si besoin de perfs (voir §1). |

Liens : **§3** (ligne Contacts), **ROADMAP** si une entrée APP couvre l’intégration carnet d’adresses.

---

*Dernière mise à jour : 2026-04-11 — §3b : aperçu Office iframe + table « Suite prioritaire » ; Calendar / Contacts : `refetchInterval` ; §0 dossiers mail ; `make run-mobile` avec guillemets.*

**Note produit — suivi d’ouverture / lecture** : les pixels de tracking et contournements de bloqueurs soulèvent **confidentialité**, **RGPD** et **fiabilité** (images désactivées, préfetch). Toute évolution doit rester **transparente** (opt-in, mentions légales) ; pas de « bypass » des protections utilisateur comme objectif produit.
