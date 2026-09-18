# Documentation Cloudity — index

Point d’entrée unique pour ne pas se perdre dans les `.md`.

## À lire en premier

| Doc | Rôle |
|-----|------|
| [`../README.md`](../README.md) | Présentation & démarrage |
| [`../ECOSYSTEME-SUITE-MODULAIRE.md`](../ECOSYSTEME-SUITE-MODULAIRE.md) | Pointeur court → rapport long + PDF |
| [`ecosystem/ECOSYSTEME-SUITE-MODULAIRE.md`](ecosystem/ECOSYSTEME-SUITE-MODULAIRE.md) | **Suite modulaire** (rapport long) |
| [`cursor/BRIEF-INTEGRATION-SUITE.md`](cursor/BRIEF-INTEGRATION-SUITE.md) | **Brief à coller dans Cursor** (JT / Fuel / PLM) |
| [`../products/README.md`](../products/README.md) | Submodules `products/` |
| [`../Cloudity.code-workspace`](../Cloudity.code-workspace) | Workspace multi-root |
| [`../STATUS.md`](../STATUS.md) | État courant du monorepo Cloudity |
| [`../TODOS.md`](../TODOS.md) | Checklist active |
| [`../BACKLOG.md`](../BACKLOG.md) | Backlog long terme |
| [`../DEPLOIEMENT_PROCEDURE.md`](../DEPLOIEMENT_PROCEDURE.md) | Déploiement Portainer Git / NPM |

## Par thème

| Thème | Dossier / fichiers |
|-------|-------------------|
| Architecture | [`architecture/`](architecture/) — structure cible, multi-repo, services |
| Opérations | [`operations/`](operations/) — branches, tests, ports, pilotage |
| Produit | [`produit/`](produit/) — Mail, Pass, Photos, roadmap |
| Sécurité | [`securite/`](securite/) |
| Décisions ADR | [`decisions/`](decisions/) |

## Hygiène

- Les récaps datés / emails de session : `reports/progress/archive/` (ne pas les rouvrir sauf audit).
- Ne **pas** supprimer `STATUS.md` / `TODOS.md` / `BACKLOG.md` : ce sont les sources de pilotage.
- `DEPLOY.md` à la racine = **pointeur** vers `DEPLOIEMENT_PROCEDURE.md`.
- Nouveaux rapports d’avancement : `reports/progress/` (pas à la racine).

## Suite multi-produits (2026-09-15)

- [Décisions porteur / email](ecosystem/EMAIL-PORTEUR-DECISIONS-SUITE-2026-09-15.md)
- [Architecture Cursor + Portainer](ecosystem/ARCHITECTURE-CURSOR-PORTAINER-SUITE.md)
- [État sync suite + prochaines actions](ecosystem/SUITE-SYNC-ETAT.md)
- [Vision Cloudity Maps](ecosystem/CLOUDITY-MAPS-VISION.md)
- [Brief Cursor satellites](cursor/BRIEF-INTEGRATION-SUITE.md)
