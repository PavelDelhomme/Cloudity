# Git — référence unique (Cloudity)

**Objectif** : une seule page pour **branches**, **intégration** et **commandes** sans multiplier les normes dans le dépôt. Le détail « quelle branche pour quel domaine » reste aussi dans **[operations/BRANCHES.md](operations/BRANCHES.md)** (tableau rapide).

**Documents liés** : [INSTRUCTIONS-IA.md](INSTRUCTIONS-IA.md) (démarche avant/après travail), [operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md), [operations/DEVELOPMENT-HOST.md](operations/DEVELOPMENT-HOST.md), [../STATUS.md](../STATUS.md), [../BACKLOG.md](../BACKLOG.md).

---

## 1. Rôles des branches

| Branche | Rôle |
|---------|------|
| **`main`** | Référence **stable** ; merges depuis `dev` (ou hotfix documenté). |
| **`dev`** | **Intégration** ; `make test` / CI verts avant merge vers `main`. |
| **`feat/<sujet>`** | Un chantier = une branche, **kebab-case**, ouverte depuis **`dev`**. |

---

## 2. Démarrer une feature

1. `git fetch origin && git checkout dev && git pull origin dev`
2. `git checkout -b feat/<nom>`
3. Commits atomiques ; PR / MR vers **`dev`** (pas vers `main` sauf hotfix).

---

## 3. Commandes utiles

```bash
git fetch origin
git checkout dev && git pull origin dev
git checkout -b feat/mon-sujet
```

### `make feature-finish`

Indexer, committer, pousser, puis renommer la branche en `feat/finish-<slug>` (voir **[operations/BRANCHES.md](operations/BRANCHES.md)** § 5b pour le détail et les options `NO_RENAME=1`, `ALLOW_MAIN=1`).

### Nettoyage des branches distantes

```bash
make git-fetch-prune
make git-delete-remote-branch BRANCH=nom-branche-obsolète
```

---

## 4. Règles projet (rappel)

- **Pas** de `git config` modifié par l’IA ; pas de force-push sur `main` / `master` sans demande explicite.
- **Secrets** : ne jamais committer `.env` ni clés ; voir **[securite/SECRETS.md](securite/SECRETS.md)**.
- Après changement de code : suivre **[INSTRUCTIONS-IA.md](INSTRUCTIONS-IA.md)** et **[operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md)**.

---

*Dernière mise à jour : 2026-05-15 — consolidation depuis BRANCHES / demandes équipe.*
