# Flux Git — branches `main`, `dev` et `feat/*`

**Objectif** : tout le monde sait **sur quelle branche travailler** selon la fonctionnalité, et comment intégrer le code sans casser la ligne stable.

**Documents liés** : [README.md](./README.md) (index `docs/`), [STATUS.md](../STATUS.md), [ROADMAP.md](./ROADMAP.md), [PHOTOS.md](./PHOTOS.md).

---

## 1. Rôles des branches

| Branche | Rôle | Qui / quand |
|---------|------|-------------|
| **`main`** | Référence **stable** du dépôt ; historique validé, prêt à être tagué ou déployé en prod selon votre processus. | Merges depuis `dev` (ou hotfix direct exceptionnel documenté). |
| **`dev`** | Branche d’**intégration** : regroupe les fonctionnalités prêtes à être recoupées entre elles avant fusion vers `main`. | Travail quotidien d’équipe ; CI / `make test` doit passer avant merge vers `main`. |
| **`feat/<sujet>`** | **Une branche par chantier** (Photos mobile, Mail archivage, admin complet, etc.). Nom en **kebab-case**, court et explicite. | Développement isolé ; ouverte depuis **`dev`** (voir § 2). |

**Note** : si une remote historique `develop` existe encore sur un fork, **`dev`** est la branche d’intégration retenue ici ; alignez les remotes ou renommez au besoin (`develop` → `dev`).

---

## 2. Règle de départ des branches `feat/*`

1. Mettre à jour `dev` : `git checkout dev && git pull origin dev` (ou `git fetch && git merge origin/main` si `dev` vient d’être créée depuis `main`).
2. Créer la feature : `git checkout -b feat/<nom>`.
3. Commits atomiques sur `feat/<nom>` ; ouvrir une MR/PR vers **`dev`** (pas directement vers `main`, sauf hotfix).

Fusion vers `main` : uniquement depuis **`dev`** après validation (tests, revue).

---

## 3. Quelle branche pour quelle fonctionnalité ?

| Fonctionnalité / domaine | Branche de travail typique | Fichiers / docs de référence |
|----------------------------|----------------------------|------------------------------|
| **Photos** — galerie web, API timeline, perf, sync web | `feat/photos-gallery-mobile-sync-security` (ou scinder `feat/photos-*` si plusieurs PRs) | `docs/PHOTOS.md`, `docs/SYNC-BACKLOG.md`, `drive-service`, `PhotosPage.tsx` |
| **Photos** — app mobile Flutter, WorkManager, batterie | Même branche ou `feat/photos-mobile` après merge partiel web | `docs/MOBILES.md`, `docs/PHOTOS.md` § 5 |
| **Photos** — sécurité (auth, ACL, chiffrement au repos futur) | `feat/photos-gallery-mobile-sync-security` ou `feat/security-photos` si chantier transversal | `docs/SECURITE-DONNEES.md`, ROADMAP **TR-01** |
| **Mail** (IMAP, archivage, tri, alias) | `feat/mail-*` | `docs/SYNC-BACKLOG.md`, ROADMAP **APP-01** |
| **Contacts / Pass / Calendar** | `feat/contacts-*`, `feat/pass-*`, `feat/calendar-*` | ROADMAP APP-xx |
| **Drive** (hors Photos) | `feat/drive-*` | ROADMAP **APP-02**, `docs/SYNC-BACKLOG.md` § 3b |
| **Back-office admin** (écrans Tenants, Users, Domaines, rôles, **exploitation complète**) | `feat/admin-console-*` | ROADMAP **ADM-01**, **STATUS** § 0b — *l’admin web a été amorcé ; il reste à le rendre **entièrement opérationnel** (rôles fins, audit, parité ops).* |
| **Transversal** (gateway, CI, monorepo front) | `feat/tr-*` ou `chore/infra-*` | ROADMAP **TR-03**, **TR-05** |

Si un chantier touche **plusieurs domaines** (ex. Photos + Drive), privilégier **une branche** avec commits logiques séparés, ou deux branches successives après merge du socle commun.

---

## 4. Améliorations à suivre (rappel)

Les éléments ci-dessous doivent rester visibles dans la roadmap ; les cocher au fil des merges.

- **Photos** : miniatures serveur, index **EXIF** (`taken_at`), albums, **sync mobile** fiable, règles **batterie / réseau**, durcissement **sécurité** (scopes JWT, validation uploads, quotas) — détail [PHOTOS.md](./PHOTOS.md).
- **Admin dashboard** : finaliser parcours **ADM-01** (toutes les actions admin utiles au quotidien, pas seulement MVP) — voir [ROADMAP.md](./ROADMAP.md) **ADM-01** et **STATUS.md** § 0b.

---

## 5. Commandes utiles

```bash
# À jour localement
git fetch origin
git checkout dev
git pull origin dev

# Nouvelle feature depuis dev
git checkout -b feat/mon-sujet

# Après merge dans dev, mise à jour main (mainteneur)
git checkout main && git merge dev && git push origin main
```

---

*Créé / mis à jour : 2026-04-11. Ajuster ce fichier si vous renommez des branches ou adoptez GitFlow strict.*
