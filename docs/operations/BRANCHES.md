# Flux Git — branches `main`, `dev` et `feat/*`

**Référence complète (normes, commandes, règles)** : **[GIT.md](../GIT.md)**.  
**Démarche assistant / humain** : **[INSTRUCTIONS-IA.md](../INSTRUCTIONS-IA.md)** · **[LOGS.md](../LOGS.md)** (journal cumulatif, sauf préfixe `NPNLD`).

**Documents liés** : [README.md](../README.md), [STATUS.md](../../STATUS.md), [BACKLOG.md](../../BACKLOG.md), [ROADMAP.md](../produit/ROADMAP.md), [PHOTOS.md](../produit/PHOTOS.md), [PERFORMANCES.md](PERFORMANCES.md).

---

## 1. Rôles des branches (rappel)

| Branche | Rôle | Qui / quand |
|---------|------|-------------|
| **`main`** | Référence **stable** du dépôt ; historique validé. | Merges depuis `dev` (ou hotfix documenté). |
| **`dev`** | Branche d’**intégration** avant `main`. | `make test` / CI verts avant merge vers `main`. |
| **`feat/<sujet>`** | **Une branche par chantier** ; nom **kebab-case**. | Ouverte depuis **`dev`** (voir [GIT.md](../GIT.md) § 2). |

---

## 2. Quelle branche pour quelle fonctionnalité ?

| Fonctionnalité / domaine | Branche de travail typique | Fichiers / docs de référence |
|----------------------------|----------------------------|------------------------------|
| **Photos** — galerie web, **`photos-service`**, `/photos/timeline`, mobile | `feat/photos-gallery-mobile-sync-security` (ou scinder `feat/photos-*`) | `docs/produit/PHOTOS.md`, `backend/photos-service`, `PhotosPage.tsx`, `mobile/photos` |
| **Photos** — app mobile Flutter, WorkManager, batterie | Même branche ou `feat/photos-mobile` après merge partiel web | `docs/produit/MOBILES.md`, `docs/produit/PHOTOS.md` § 5 |
| **Photos** — sécurité (auth, ACL, chiffrement au repos futur) | `feat/photos-gallery-mobile-sync-security` ou `feat/security-photos` | `docs/securite/SECURITE-DONNEES.md`, ROADMAP **TR-01** |
| **Mail** | `feat/mail-*` | `docs/produit/SYNC-BACKLOG.md`, ROADMAP **APP-01** |
| **Contacts / Pass / Calendar** | `feat/contacts-*`, `feat/pass-*`, `feat/calendar-*` | ROADMAP APP-xx |
| **Drive** (hors Photos) | `feat/drive-*` | ROADMAP **APP-02**, `docs/produit/SYNC-BACKLOG.md` § 3b |
| **Back-office admin** | `feat/admin-console-*` | ROADMAP **ADM-01**, **STATUS** § 0b |
| **Transversal** (gateway, CI, monorepo front) | `feat/tr-*` ou `chore/infra-*` | ROADMAP **TR-03**, **TR-05** |
| **Sécurité** (gosec, gitleaks, auth web) | `feat/security-*` (ex. `feat/security-gosec-hardening`, `feat/security-mobile-audit`) | **docs/securite/GOSEC.md**, **SECRETS.md** |
| **Admin 2FA avancée (U9)** | `feat/admin-u9-2fa-advanced` | ROADMAP **ADM-01**, **TODOS.md** U9 |
| **Performances / observabilité** | `feat/perf-*` ou `chore/observability-*` | **PERFORMANCES.md**, ROADMAP **TR-06** |

---

## 3. Améliorations à suivre (rappel)

- **Photos** : miniatures serveur, index **EXIF**, albums, **sync mobile**, durcissement **sécurité** — [PHOTOS.md](../produit/PHOTOS.md).
- **Admin dashboard** : parcours **ADM-01** — [ROADMAP.md](../produit/ROADMAP.md), **STATUS.md** § 0b.

---

## 4. Commandes utiles & `make feature-finish`

Voir **[GIT.md](../GIT.md) § 3** pour les commandes `git` de base.

### `make feature-finish`

Quand une branche `feat/…` contient le travail à publier et que vous voulez **tout indexer**, **committer**, **pousser**, puis **renommer** la branche en `feat/finish-<slug>` :

```bash
make feature-finish MSG="feat(photos): galerie timeline + tests"
```

Comportement (script `scripts/feature-finish.sh`) :

1. `git add -A` puis `git commit -m "MSG"` (si des changements sont en attente ; si tout est déjà commité mais **ahead** de `origin`, pas de commit vide).
2. `git push -u origin HEAD` sur le **nom actuel** de la branche.
3. Renommage local en `feat/finish-<slug>`, push de la nouvelle branche, suppression distante de l’ancien nom (best effort).

Options : `NO_RENAME=1`, `ALLOW_MAIN=1` (déconseillé). Nettoyage : `make git-fetch-prune`, `make git-delete-remote-branch BRANCH=…`.

---

*Dernière mise à jour : 2026-05-15 — renvoi canonique vers GIT.md + INSTRUCTIONS-IA + LOGS.*
