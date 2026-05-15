# Instructions — assistant IA (avant / après travail)

**Objectif** : cadre **reproductible** pour tout chantier (code, doc, infra). Les humains peuvent suivre la même checklist.

**Documents liés** : [GIT.md](GIT.md) · [LOGS.md](LOGS.md) · [operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md) · [operations/TESTS.md](operations/TESTS.md) · [operations/BRANCHES.md](operations/BRANCHES.md) · [../STATUS.md](../STATUS.md) · [../BACKLOG.md](../BACKLOG.md) · [../TODOS.md](../TODOS.md).

---

## Mot magique « NPNLD »

Si le **tout début** du message utilisateur est exactement **`NPNLD`** (sur la première ligne, sans préfixe), **ne pas** ajouter d’entrée dans **[LOGS.md](LOGS.md)** pour ce tour (le reste des instructions s’applique sauf mention contraire).

---

## Partie A — Avant de commencer

1. **Branche** : vérifier `git status`, la branche courante et le suivi `origin` — alignement avec [GIT.md](GIT.md) et le tableau [operations/BRANCHES.md](operations/BRANCHES.md).
2. **Contexte** : relire **[STATUS.md](../STATUS.md)** (§ *À faire maintenant*) et, si pertinent, **[BACKLOG.md](../BACKLOG.md)** / **[TODOS.md](../TODOS.md)**.
3. **Périmètre** : identifier les docs produit / sécu / ops **réellement** concernées (éviter de tout relire sans lien avec la tâche).
4. **Journal** : sauf **NPNLD**, préparer une entrée **pendant** le travail pour **[LOGS.md](LOGS.md)** (voir format dans ce fichier).

---

## Partie B — Après avoir terminé

1. **Qualité** : [operations/DEV-VERIFICATION.md](operations/DEV-VERIFICATION.md) — au minimum **`make test`** pour une touche transverse ; cibles **Make** plutôt que `npm` / `go` ad hoc sur l’hôte (voir § ci-dessous).
2. **Statut** : mettre à jour **[STATUS.md](../STATUS.md)** si l’état global ou *À faire maintenant* change.
3. **Suivi court** : **[TODOS.md](../TODOS.md)** pour les micro-actions restantes ; **[BACKLOG.md](../BACKLOG.md)** pour les livrables structurants.
4. **Journal** : finaliser l’entrée **[LOGS.md](LOGS.md)** (sauf **NPNLD**).

### Préférence « flux habituel » (Make)

- **Tests dashboard / Vitest** : `make test-dashboard` ou `make test-dashboard-one FILE=…` (Docker ; pas besoin de `cd frontend && npm run test` sur l’hôte pour valider la CI).
- **Dépendances npm** après ajout de paquets : `make dashboard-npm-install` ou `make frontend-install` (voir [operations/TESTS.md](operations/TESTS.md)).
- **Stack** : `make up` (avec outils dev **Adminer** + **Redis Commander** via profil `dev`) ou **`make up-lean`** sans ces UIs — voir [operations/PORTS-HOTES.md](operations/PORTS-HOTES.md).

---

## Purges de documentation (produit / sécurité)

Ne **supprimer** ni archives de décisions, ni comparatifs ayant servi à trancher, **sans revue humaine** : les marquer « clos / non retenu » ou les déplacer vers un doc d’archive si besoin. L’assistant peut proposer une liste ; la validation reste côté équipe.

---

*Dernière mise à jour : 2026-05-15.*
