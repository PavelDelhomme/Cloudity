# Suite productivité — écart produit (Contacts / Tasks / Notes)

> **Pilotage** : **APP-08-OPEN** (Contacts), **APP-07-OPEN** (Tasks), **APP-06-OPEN** (Notes) — cycle `cycle-web-apps`.  
> **Étape 1** du projet : **[TROIS-ETAPES.md](TROIS-ETAPES.md)** § 1.A.  
> **Ordre** : finir Focus **MOBILE-DA-01** (structure) → puis ces apps **web d’abord** ; mobile Flutter = même API ensuite.  
> **Déploiement** : [`docs/operations/DEPLOIEMENT-PAR-SERVICE.md`](../operations/DEPLOIEMENT-PAR-SERVICE.md) § 2bis (migrate → service → `deploy-web`).  
> Index : [`ROADMAP.md`](ROADMAP.md).

## Principe

| Surface | Priorité |
|---------|----------|
| **Web** (`/app/contacts`, `/app/tasks`, `/app/notes`) | **Faire d’abord** — formulaire / UX produit |
| **Mobile** Flutter | Après contrat API stable (pas de second produit) |

Les MVP actuels sont trop maigres vs Google Contacts / Google Tasks / Evernote.

---

## APP-08 — Contacts (cible Google Contacts)

### Livré (web, partiel — Pilotage v16)
- Schéma : `contacts.profile` JSONB (migration **49**) ; API `profile` create/update/list/get ; dénorm `name` / `email` / `phone`.
- UI `/app/contacts` : `ContactRichForm` (identité, orga, multi-tél + pays, multi-emails, adresses, anniversaire, labels, sites, relations, notes) ; détail fiche enrichi.

### Déploiement (local)
Voir [`DEPLOIEMENT-PAR-SERVICE.md`](../operations/DEPLOIEMENT-PAR-SERVICE.md) § 2bis :

```bash
make migrate
make deploy-service SERVICE=contacts-service
make deploy-web
# smoke : /app/contacts
```

### Reste (web)
1. ~~Identité / orga / multi phone-email / notes / adresses / sites / relations / labels~~ → **fait** (formulaire + API).
2. **Interop** : import/export **vCard** ; liaison Mail (`SYNC-MAIL-CONTACTS`).
3. Groupes labels avancés / phonétique si besoin produit.
4. **Mobile** Flutter aligné sur `profile` (plus tard).

---

## APP-07 — Tasks (cible Google Tasks)

### Livré (web, partiel)
- Schéma mig. **50** : `parent_id`, `notes`, `start_at`, `starred`.
- API create/update/list + UI `/app/tasks` : sous-tâches (1 niveau), notes, début/échéance, étoile.

### Reste
1. Lien / sync **Calendar**. **Vers Agenda** web livré (2026-08-31).
2. **Mobile** Flutter aligné.
3. Profondeur sous-tâches > 1 si besoin produit.

### Déploiement (local)
Voir [`DEPLOIEMENT-PAR-SERVICE.md`](../operations/DEPLOIEMENT-PAR-SERVICE.md) § 2bis :

```bash
make migrate
make deploy-service SERVICE=tasks-service
make deploy-web
# smoke : /app/tasks
```

---

## APP-06 — Notes (cible Google Keep)

### Livré (web, partiel — Pilotage v19 / branche `feat/notes-google-keep`)
- Mig. **51–52** : `pinned`, `labels`, `archived`, `remind_at`, `extras` (checklist / images / dessin) ; `color` (19).
- UI Keep+ : recherche, cartes masonry, compose/popup, couleurs, pin, archive, rappel, checklist, images (fichier), dessin canvas, formatage B/I/U ; caméra = **mobile only** ; coffre local.

### Reste
1. Caméra / galerie natives (Flutter).
2. Notifications push pour rappels.
3. Liens vers Tâche + Agenda ; rappels visibles dans Agenda le jour J. **Vers Agenda** web livré (2026-08-31).

### Déploiement (local)
```bash
make migrate
make deploy-service SERVICE=notes-service
make deploy-web
# smoke : /app/notes
```

---

## Où cliquer dans Pilotage

1. `/4dm1n/pilotage` → **Sync docs**.
2. Cycle **Apps web & UX** (`cycle-web-apps`).
3. Cartes **APP-08-OPEN**, **APP-07-OPEN**, **APP-06-OPEN** (checklists détaillées).
4. Ne pas bloquer **MOBILE-DA-01** : ces cartes = après structure DA/auth.
