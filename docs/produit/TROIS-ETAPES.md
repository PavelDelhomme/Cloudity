# Cloudity — 3 grandes étapes (projet complet)

> **Boussole d’exécution** (août 2026). Ce fichier **ordonne** le travail restant en **trois étapes** successives.  
> Il **ne remplace pas** [BACKLOG.md](../../BACKLOG.md) (cases techniques), [ROADMAP.md](ROADMAP.md) (fiches APP/TR) ni [VISION-SUITE.md](VISION-SUITE.md) (P0–P7 stratégique).  
> **Règle** : on ne démarre l’étape N+1 comme *focus principal* que lorsque les **critères de fin** de N sont verts (des chantiers « fond de file » de N+1 peuvent avancer en parallèle s’ils n’alourdissent pas la dette).

**État réel du dépôt aujourd’hui** (ne pas relire les sprints mai 2026 comme si c’était encore le présent) :

- **Prod VPS** : stack Portainer + gateway HTTPS, OTA APK, compte réel utilisé.
- **Identité** : JWT + refresh, 2FA, passkeys, SSO mobile (broker) — à durcir, pas à réinventer.
- **Apps** : Mail, Pass, Drive, Photos, Agenda, Notes, Tâches, Contacts, Admin — **MVP ou plus** sur web **et** Android.
- **Ce qui manque vraiment** : profondeur produit (Google/Proton-like), **liaisons** entre apps, Mail hébergé (alias/MTA), sync bureau, Office collab, distribution grand public.

---

## Vue d’ensemble

| Étape | Nom | Promesse utilisateur | Durée indicative |
|-------|-----|----------------------|------------------|
| **1** | **Suite quotidienne** | On peut vivre dans Cloudity au jour le jour (agenda, notes, tâches, contacts, mail, pass) **web + téléphone**, sans friction. | 4–8 semaines |
| **2** | **Plateforme souveraine** | Identité mail Cloudity (alias + MTA), coffre Pass complet, Drive/Photos « vrais », push, qualité code. | 8–14 semaines |
| **3** | **Suite complète** | Office + collab, recherche unifiée, desktop Linux, stores, observabilité, autonomie ops. | 3–6 mois |

```text
Étape 1 ──►  on l’utilise vraiment tous les jours
Étape 2 ──►  on n’a plus besoin de Gmail / Proton / Nextcloud pour l’essentiel
Étape 3 ──►  on peut le proposer à d’autres (qualité, collab, distribution)
```

---

## Étape 1 — Suite quotidienne (web ↔ mobile, liaisons)

### Objectif

Que **Agenda, Notes, Tâches, Contacts, Mail, Pass** soient **utilisables chaque jour** sur le **web** et **Android**, avec les **mêmes données**, et des **ponts** entre apps (note → événement, tâche → agenda, contact → mail / RDV).

Pas encore : MTA prod, Office collab, client Drive bureau, Play Store.

### Critères de fin (tous requis)

- [ ] Agenda : bandeau jours + Aujourd’hui + vues jour/semaine/mois **stables** ; créer / modifier / supprimer un événement **web et mobile** ; overlay tâches visible ; **récurrence** daily/weekdays/weekly/monthly (stockage + expansion client).
- [ ] Notes Keep-like **web** + mobile aligné (pin, archive, checklist, rappel) ; **Vers Agenda** (et inverse depuis Agenda). **Mobile** : couleur, pin, rappel livrés.
- [ ] Tâches : listes, sous-tâches, dates, étoile ; **Vers Agenda** ; création depuis l’Agenda. **Mobile** : dates / étoile / répétition livrés.
- [ ] Contacts : fiche riche ; **mail** + **rendez-vous Agenda** depuis la fiche ; import CSV/vCard au moins un format fiable. **Mobile** : org / poste / anniversaire / notes profil livrés.
- [ ] Mail : lire / envoyer / dossiers **sans casser** la session mobile ; ouvrir un contact depuis un message (déjà partiel → fiabiliser).
- [ ] Pass : déverrouillage + CRUD **web** ; **édition mobile** (plus lecture seule) ; extension Chrome utilisable au quotidien.
- [ ] SSO : login une fois → les 9 apps Android voient le compte ; Admin joignable (réseau + JWT).
- [ ] Empty states + FAB « Créer » cohérents sur les 4 apps suite (Agenda / Notes / Tâches / Contacts).
- [ ] Smoke manuel : Samsung + Nothing + web prod, **même compte**, CRUD sur les 4 apps suite + Mail + Pass.

### Chantiers (checklist)

#### 1.A — Productivité (Agenda / Notes / Tâches / Contacts)

- [x] **Agenda** : récurrence simple (quotidien / hebdo / ouvrés / mensuel) — stockée `repeat_rule` + expansion client (2026-08-31) ; rappel local (web notification ou in-app) ☐ ; export `.ics` ☐.
- [x] **Notes** : **Vers Agenda** web + mobile couleur/pin/rappel (2026-08-31) ; Notes→Tâche ☐ ; rappels visibles dans Agenda le jour J ☐.
- [x] **Tâches** : lien Calendar (Vers Agenda) + mobile dates/étoile/répétition (2026-08-31).
- [x] **Contacts** : mail + RDV Agenda web ; mobile profile (org/poste/anniversaire/notes) (2026-08-31) ; export vCard ☐.
- [x] **Interconnexions web** : Notes→Agenda, Tâches→Agenda, Contacts→Agenda, Agenda→Tâche/Note, Contacts→Mail (2026-08-31). Reste : Notes→Tâche, rappels jour J.

#### 1.B — Mobile (parité, pas de nouveau produit)

- [ ] Calendar / Notes / Tasks / Contacts : plus de « coquille CRUD » — mêmes champs que le web pour le chemin heureux.
- [ ] Pass mobile : **création / édition / suppression** d’items (BACKLOG L2).
- [ ] Mail / Drive / Photos : pas de régression SSO ; erreurs réseau lisibles (pas « injoignable » à tort).
- [ ] Safe area / clavier : toutes les bottom sheets (déjà amorcé).

#### 1.C — Qualité de vie

- [ ] Recherche **dans** chaque app (notes, tâches, contacts, agenda) — pas encore le moteur unique (étape 3).
- [ ] Préférences app (thème, verrouillage coffre Notes/Contacts) stables après rechargement.
- [ ] OTA : rebuild + install device après chaque palier ; `version.json` à jour si on publie.

### Hors étape 1 (volontairement)

MTA/DKIM, archivage mail PG, Drive desktop, Photos coffre/albums avancés, Office collab, F-Droid/Play, WAF, DHT.

### Docs liées

[SUITE-PRODUCTIVITY-GAP.md](SUITE-PRODUCTIVITY-GAP.md) · [MOBILES.md](MOBILES.md) · [SYNC-BACKLOG.md](SYNC-BACKLOG.md) § Calendar/Contacts

---

## Étape 2 — Plateforme souveraine (mail, coffre, fichiers)

### Objectif

Cloudity **porte** l’identité mail (alias + réception), un **Pass** au niveau d’un gestionnaire du quotidien, un **Drive / Photos** qu’on n’a plus honte de comparer à Nextcloud / Google, et une **qualité** (tests, perf, dette front) tenable.

### Critères de fin

- [ ] Un alias `quelquechose@alias.<domaine>` **reçoit** du mail Internet et apparaît dans Mail (filtre `delivered_to`) ; **envoi** avec `From` = alias + SPF/DKIM/DMARC verts.
- [ ] Pass : autofill Android ; import Proton encore OK ; backup / recovery documenté ; extension Firefox au même niveau que Chrome (Safari = bonus).
- [ ] Drive : partage lien + permissions lecture/écriture ; versions ; preview types courants ; PJ Mail → Drive (un flux).
- [ ] Photos : albums, corbeille, sync sobre (batterie) ; galerie web = mobile.
- [ ] Push : au moins **un** canal (Web Push **ou** FCM Android) pour mail nouveau + rappel agenda.
- [ ] `MailPage.tsx` / `api.ts` **découpés** (REFACTOR-FE-01 puis FE-02) — plus de fichiers > 3k lignes sur le chemin critique.
- [ ] `make test` + E2E Playwright mail/pass/calendar verts sur CI `dev`.

### Chantiers

#### 2.A — Mail & alias (prod, plus de « pause » une fois l’étape 1 verte)

- [ ] **MAIL-ALIAS-05/06** : Maddy/Rspamd prod, injection IMAP, DKIM.
- [ ] **MAIL-STOR-01** : cache / archive PG (quota + rétention).
- [ ] Threads, snooze, sous-dossiers IMAP CREATE.
- [ ] Anti-spam : AS-1 complet, AS-2 rate-limits granulaires.

Détail : [MAIL-ALIAS.md](MAIL-ALIAS.md) · BACKLOG `MAIL-ALIAS-*` / `AS-*`.

#### 2.B — Pass (niveau quotidien + mobile)

- [ ] Édition mobile (si non fini en 1.B) + **PASS-AUTOFILL-ANDROID**.
- [ ] Bouton extension « Alias pour ce site » (**MAIL-ALIAS-04**).
- [ ] Backup coffre [PASS-BACKUP.md](PASS-BACKUP.md) ; passkeys pour *unlock* coffre (pas seulement login compte).

#### 2.C — Drive & Photos

- [ ] Partage, versions, previews, quotas visibles.
- [ ] Photos : albums, corbeille dédiée, métadonnées, dédup légère.
- [ ] Spec **DRIVE-DESKTOP-01** rédigée (implémentation daemon = étape 3).

#### 2.D — Transverse

- [ ] Push notifications (Web Push VAPID et/ou FCM).
- [ ] REFACTOR-FE-01 (`api.ts` par domaine) puis FE-02 Mail / FE-03 Drive.
- [ ] FE-SEC-SUPPLY-05 (crypto hors npm JS si encore ouvert).
- [ ] PERF-CLI-04/05 (hook + ingestion CI) si le rituel snapshot est déjà adopté.

### Hors étape 2

Office collab multi-curseurs, client sync bureau, Play/F-Droid, réseau décentralisé, mTLS strict partout.

### Docs liées

[MAIL-ALIAS.md](MAIL-ALIAS.md) · [PHOTOS.md](PHOTOS.md) · [FRONTEND-LAYOUT.md](../architecture/FRONTEND-LAYOUT.md) · [SECURITE.md](../securite/SECURITE.md)

---

## Étape 3 — Suite complète (Office, desktop, distribution, ops)

### Objectif

Une **suite** qu’on peut montrer / héberger pour d’autres : documents collaboratifs, **recherche unifiée**, apps Linux, mises à jour propres, observabilité, durcissement prod.

### Critères de fin

- [ ] Office Docs : édition web + sauvegarde Drive ; présence / commentaires **ou** au minimum conflict-free pour 2 utilisateurs.
- [ ] Recherche **cross-apps** (Mail + Drive + Notes + Contacts + Pass titres) depuis Ctrl+K.
- [ ] Client Drive bureau **Linux** (miroir dossier) MVP — [DRIVE-DESKTOP-SYNC.md](DRIVE-DESKTOP-SYNC.md).
- [ ] Canal release : APK signés + `version.json` (REL-01…03) ; F-Droid **ou** sideload documenté.
- [ ] Admin : écran versions / migrations ; indicateurs màj services (ADM-UPDATE).
- [ ] Observabilité : métriques p95 gateway + 1 dashboard (même CLI-first) ; WAF/fail2ban (AS-3) en détection.
- [ ] ZoneForge **ou** procédure unique : redeploy préprod/prod sans SSH artisanal (ZF-03…05).

### Chantiers

#### 3.A — Productivité avancée

- [ ] Office (Docs d’abord) — [editeur-docs.md](editeur-docs.md).
- [ ] Calendar : CalDAV / invitations `.ics` RSVP ; Contacts : CardDAV optionnel.
- [ ] Permissions unifiées (lecture / écriture / partage / audit) — vision [SECURITE.md](../securite/SECURITE.md).

#### 3.B — Surfaces clientes

- [ ] Mail Linux Flutter (**MP-03**) ; validation desktop Drive/Photos déjà amorcée.
- [ ] Autofill iOS / Safari extension = si ressources.
- [ ] Enrôlement multi-appareil Pass hybride PQ (Envelope v2) — fond de roadmap.

#### 3.C — Ops & distribution

- [ ] REL-01…03 OTA industrialisé ; ADM-UPDATE-01.
- [ ] OpenAPI par service (`docs/cloudity-api-contracts/`).
- [ ] mTLS `strict` + Postgres/Redis TLS verify-full (BACKLOG items 4–5 post-Pass).
- [ ] Split stacks Portainer par domaine (optionnel, après ZF).
- [ ] **ARCH-DHT-01** seulement si on décide vraiment un réseau pair-à-pair — [ARCHITECTURE-RESEAU-DECENTRALISE.md](../decisions/ARCHITECTURE-RESEAU-DECENTRALISE.md).

### Hors étape 3 (volontairement « jamais sauf décision »)

Wallet / HSM / Kubernetes / Kong / Mongo — le README racine historique les cite ; **ce n’est pas le plan actuel**. On reste Compose + gateway Go + Postgres + Redis.

---

## Ordre de travail *dans* une étape

1. **Web d’abord** pour tout nouveau flux (contrat API) — [MOBILES.md](MOBILES.md) § 0.  
2. **Mobile** ensuite, même API, `cloudity_shared`.  
3. **Prod** : `make push-prod` seulement quand le palier est smoke-testé en local / device.  
4. **Mail prod / DNS / MTA** : pas avant l’étape 2 (sauf correctif d’urgence).

## Comment cocher

- Cases **critères de fin** → ici.  
- Cases techniques fines → [BACKLOG.md](../../BACKLOG.md) / [TODOS.md](../../TODOS.md).  
- Fait du jour → [STATUS.md](../../STATUS.md) *À faire maintenant* + [LOGS.md](../LOGS.md).

---

*Créé 2026-08-31 — aligné sur l’état réel (prod + suite mobile) plutôt que sur le sprint Pass mai 2026.*
