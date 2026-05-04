# Vision suite Cloudity — ordre produit & alignement dépôt

> **Rôle** : définir Cloudity comme une **suite cohérente** (pas une liste d’apps indépendantes), avec un **ordre stratégique** de valeur et de dépendances techniques. Ce document **complète** — ne remplace pas — **[SECURITE.md](./SECURITE.md)** (confiance), **[PERFORMANCES.md](./PERFORMANCES.md)** (diagnostic / TR-06), **[ROADMAP.md](./ROADMAP.md)** (fiches APP-xx), **[STATUS.md](../STATUS.md)** (fait / en cours) et **[BACKLOG.md](../BACKLOG.md)** (actions).

## 1. Trois couches produit

| Couche | Rôle | Apps / chantiers typiques |
|--------|------|-----------------------------|
| **Fondation** | Identité, auth, chiffrement des secrets, sync technique, notifications, **recherche / indexation**, design system, **observabilité** | auth-service, gateway, jobs, **[PERFORMANCES.md](./PERFORMANCES.md)**, **TR-06**, **[SECURITE.md](./SECURITE.md)** |
| **Communication personnelle** | Mail, alias, contacts, calendrier, coffre mots de passe | Mail, Alias (service / routage), Contacts, Calendar, Pass |
| **Données & productivité** | Stockage structuré, médias, bureautique | Drive, **Photos** (produit distinct de Drive côté UX), Office |

**Important** : la fondation n’est pas « terminée avant toute app » : elle **évolue en parallèle** (tests, perf, sécurité). Voir § 6 pour l’état réel du dépôt.

## 2. Priorités stratégiques (cible long terme)

Numérotation **P0–P7** : ordre **logique** pour maximiser valeur marché et cohérence (inspiré d’une articulation type Google Workspace : messagerie et identité avant bureautique lourde).

| Id | Priorité | Contenu |
|----|----------|---------|
| **P0** | **Fondation obligatoire** | Auth unifiée, MFA, sessions ; coffre de secrets / audit ; notifications centralisées ; **recherche & indexation** (y compris cross-apps — voir **[BACKLOG.md](../BACKLOG.md)** recherche) ; jobs / files ; **PERFORMANCES.md** + **TR-06** ; UI design system ; observabilité (logs, erreurs). |
| **P1** | **Mail complet web + mobile** | Multi-boîtes, IMAP fiable, cache, inbox unifiée / par compte, threads, dossiers + sous-dossiers, labels, archive / spam / corbeille, **recherche** (dont FTS mail côté Cloudity), PJ, règles, sécurité affichage ; mobile au pas du web une fois contrats stables (**[MOBILES.md](./MOBILES.md)** § 0). |
| **P2** | **Alias mail (produit / routage)** | Domaine dédié, création / désactivation / suppression, rattachement boîte cible, usage depuis Mail + Pass ; **pas** une simple feature locale si le produit vise l’anti-relay et la traçabilité — **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** § 2, **ROADMAP APP-04**. |
| **P3** | **Password Manager** | Coffre, vaults, générateur, **lien alias** — alignement **[ROADMAP.md](./ROADMAP.md)** Pass. |
| **P4** | **Photos mobile + sync** | Produit **autonome** (timeline, albums, métadonnées, pipeline miniatures) ; stockage bas niveau peut mutualiser une couche objet avec Drive, **sans** fusionner l’expérience « dossier Drive » — **[PHOTOS.md](./PHOTOS.md)**. |
| **P5** | **Drive** | Fichiers, partage, versions, previews, quotas, **PJ Mail ↔ Drive** — après socle mail/pass/photos suffisant pour l’usage perso. |
| **P6** | **Contacts + Calendar (profondeur)** | Interop Mail (invitations `.ics`, fiches), Drive (partage), Office (mentions) ; protocoles standards sortants. |
| **P7** | **Office** | Docs d’abord ; besoin Drive, permissions, commentaires, présence — **après** socle § P1–P5 raisonnable. |

## 3. Huit décisions produit à figer

1. **Compte Cloudity ≠ une seule mailbox** — plusieurs boîtes par utilisateur (**[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** § 0a).
2. **Alias = capacité centrale** — Mail et Pass **consomment** le service / politique d’alias, sans dupliquer la logique métier.
3. **Contacts = service transversal** — Mail, Calendar, Drive, Office, Pass s’appuient sur une source de vérité (progressif).
4. **Photos ≠ « sous-dossier Drive »** dans la promesse utilisateur — pipeline et UX dédiés (**[PHOTOS.md](./PHOTOS.md)**).
5. **Calendar** — entrées / sorties **iCalendar** (.ics), RSVP où pertinent.
6. **Mail** — threads + labels + dossiers + états standard **dès la conception** des APIs / schémas (IMAP + cache Cloudity).
7. **Recherche** — **moteur / index communs** pour Mail, Drive, Photos, Contacts, Pass (état actuel : mail FTS, Drive search, hub Ctrl+K — extension cross-apps documentée **BACKLOG / TESTS**).
8. **Permissions** — un modèle unifié (lecture, édition, partage, délégation, audit) sur la durée — **[SECURITE.md](./SECURITE.md)**.

## 4. Phases indicatives (calendrier souple)

Les phases **A–F** sont un **guidage**, pas un contrat date à date. Le dépôt peut **avancer en parallèle** sur plusieurs fronts (ex. Mail web mature + Photos mobile) tant que la dette et les dépendances restent gérées.

| Phase | Objectif | Rappel dépôt |
|-------|-----------|--------------|
| **A** — Socle viable | Auth, secrets, notifications de base, sync mail stable, contacts/cal **minimaux**, design system, coque mobile | **make test**, **SECURITE** phases, **STATUS** § 0b |
| **B** — Mail MVP+ quotidien | Multi-boîtes, dossiers, PJ, recherche, règles, spam/archive, mobile aligné | Grande partie **déjà engagée** — voir **STATUS** Mail |
| **C** — Différenciation | Alias complets, Pass MVP+, intégrations Mail ↔ Alias ↔ Pass | **BACKLOG**, **ROADMAP APP-04** |
| **D** — Écosystème perso | Photos sync complète, galerie web/mobile, dédup / métadonnées | **PHOTOS.md**, **TODO** |
| **E** — Drive & pièces jointes | Partage, versions, previews, liens Mail | **SYNC-BACKLOG** § 3 |
| **F** — Productivité | Contacts/Calendar profonds, Office Docs, collaboration | **editeur-docs.md**, **STATUS** § 1b |

## 5. Rapport avec « web puis mobile »

La règle **[MOBILES.md](./MOBILES.md)** § **0** (*stabiliser les flux et API sur le web avant de figer le mobile*) reste **valable par produit**. Elle ne contredit pas § 2 : on peut prioriser **stratégiquement** Mail (P1) tout en ayant déjà une app Photos Flutter — les chantiers **parallèles** sont explicités dans **STATUS** et **TODO**.

## 6. État du dépôt (avril 2026) — où on en est par rapport à § 2

| Thème | Déjà bien engagé dans le repo | Poursuite typique |
|--------|-------------------------------|-------------------|
| **Fondation / perf / sécu** | Gateway JWT, **PERFORMANCES.md**, **make test**, CI Docker | TR-06 mesures, phases **SECURITE.md** |
| **Mail** | Multi-boîtes, sync IMAP, dossiers spéciaux, **FTS**, règles + réconciliation IMAP, batch actions, sync auto UI, notifications hors page Mail, alias boîte + lien Pass (MVP) | Sous-dossiers IMAP **CREATE**, threads, snooze, anti-spam avancé, stabilité React, archivage PG |
| **Pass** | MVP coffre web | TOTP, autofill, densité fonctionnelle **ROADMAP** |
| **Photos** | Timeline API, web galerie, mobile, barre bas, albums partiels | Création album, corbeille dédiée, coffre, sync batterie — **TODO** |
| **Drive** | Récents, recherche `?q=`, table, corbeille | Mobile liste, ZIP, E2E |
| **Recherche** | Drive search API, palette hub, **Mail FTS** | **Cross-apps** Mail + Pass + … (**BACKLOG**) |

Ce tableau évite de **réécrire** l’historique : la vision § 2 est la **boussole** ; **STATUS / BACKLOG / TODO** décrivent le **terrain**.

## 7. Lectures croisées

| Besoin | Fichier |
|--------|---------|
| Actions quotidiennes | **[TODO.md](./TODO.md)** |
| Cases à cocher condensées | **[BACKLOG.md](../BACKLOG.md)** |
| Détail technique sync / mail serveur | **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** |
| Dépannage dev Mail / console | **[PLAN.md](./PLAN.md)** |
| Tests | **[TESTS.md](./TESTS.md)** |
| Suivi détaillé par app | **[STATUS.md](../STATUS.md)** |

---

*Document ajouté pour aligner une proposition de roadmap « suite type Workspace » avec les fichiers déjà suivis par l’équipe (performances, sécurité, backlog réel). Mise à jour : 2026-04-30.*
