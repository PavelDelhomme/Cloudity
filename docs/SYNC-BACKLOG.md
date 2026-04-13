# Backlog — synchronisation, mobile, session, mail serveur

Document de **travail** : tout ce que nous voulons faire sur la sync (web + mobile), les apps Flutter à scaffold, la session longue durée, et l’**archivage mail côté serveur**. Détail produit : **[ROADMAP.md](./ROADMAP.md)** (**APP-01** … **APP-10**, **TR-07**). Mobile : **[MOBILES.md](./MOBILES.md)**. Tests : **[TESTS.md](./TESTS.md)**.

---

## 0a. Compte Cloudity, Drive et plusieurs boîtes mail

- **Un utilisateur** (`users.id`, ex. `admin@cloudity.local` ou `pavel@gmail.com` après inscription) possède un **JWT** ; **Drive** et **Mail** utilisent le même `user_id`.
- Chaque boîte connectée est une ligne **`user_email_accounts`** (`user_id`, `email`, …). Plusieurs boîtes (ex. `candidatures@…`, Gmail perso) = plusieurs lignes pour le **même** `user_id` ; les messages sont en **`mail_messages.account_id`**.
- Aucune migration supplémentaire n’est requise pour « lier » Mail et Drive : c’est déjà le **compte Cloudity** commun. Un lien produit explicite (ex. dossier Drive par défaut par boîte) peut être ajouté plus tard si besoin.

## 0. Réponses rapides (comportement actuel Mail web)

| Question | Réponse |
|----------|---------|
| **Sans recharger la page**, la liste se met à jour quand je reçois / envoie des mails ? | **Oui** pour le **dossier actuellement affiché** : polling IMAP (~25 s) sur toutes les boîtes + `invalidateQueries` + refetch TanStack Query. |
| **Boîte de réception, Envoyés, Brouillons, Spam** — même mécanisme ? | **Oui** tant que tu es **dans** ce dossier dans l’UI : les messages viennent de la même API (`folder=inbox|sent|drafts|spam|…`). Les **brouillons** ne sont **pas** du « temps réel IMAP instantané » : ils apparaissent après la prochaine sync qui lit le dossier Drafts côté IMAP. |
| **Corbeille** | **Sync IMAP** : le backend inclut désormais **Trash** (`Trash`, `[Gmail]/Trash`, `Deleted Messages`, `Bin`, etc.) dans `syncAccountIMAP`, en plus des messages passés en `trash` depuis l’app (même table, clé UID). |
| **« Temps réel »** | Ce n’est **pas** du WebSocket : **polling** + retour sur l’onglet. Suffisant pour un MVP ; push plus tard (TR-07). |

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
| **Calendar** | `refetchOnWindowFocus` + mutations | **Polling léger** optionnel (ex. `refetchInterval` conditionnel), rappels, invitations, CalDAV (cible), lien Mail/Tasks. |
| **Contacts** | Idem | **Import web** : CSV (export Google), JSON, HTML tableau via `POST /contacts/import` ; groupes, export vCard, **liaison Mail ↔ Contacts** (voir **§10**). |
| **Drive** | Idem | **Priorité produit** : corbeille, preview, partage — voir APP-02. |
| **Photos** | Placeholder | Service + client web puis mobile. |

Stratégie unifiée : **TR-07** dans ROADMAP.

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
make run-mobile APP=Admin    # seul projet Flutter présent aujourd’hui
make run-mobile APP=Drive
make run-mobile APP=Mail
make run-mobile APP=Calendar
make run-mobile APP=Contacts
make run-mobile APP=Photos
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
- [ ] **Calendar** : polling ou push + rappels.
- [ ] **Contacts** : fonctionnalités groupe + import/export.
- [ ] **Drive** : parcours produit prioritaire (déjà MVP — extensions ROADMAP).
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

*Dernière mise à jour : 2026-04-13 — §10 : mode sélection type client mail + lien Contacts (`?q=`) + ligne « Reçu : » détaillée dans la liste.*

**Note produit — suivi d’ouverture / lecture** : les pixels de tracking et contournements de bloqueurs soulèvent **confidentialité**, **RGPD** et **fiabilité** (images désactivées, préfetch). Toute évolution doit rester **transparente** (opt-in, mentions légales) ; pas de « bypass » des protections utilisateur comme objectif produit.
