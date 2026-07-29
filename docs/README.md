# Documentation Cloudity

**Par où commencer**

| Priorité | Fichier | Rôle |
|----------|---------|------|
| **1** | **[`TODOS.md`](../TODOS.md)** (racine) | Fil de session / « maintenant » |
| **2** | **[`architecture/MULTI-APPS-WEB-MOBILE.md`](architecture/MULTI-APPS-WEB-MOBILE.md)** | **Priorité code** : hub web + DA/auth Flutter (avant VPS) |
| **3** | **[`operations/DEPLOIEMENT.md`](operations/DEPLOIEMENT.md)** | Chemin ops : §0 structure · local · puis prod Portainer/NPM |
| **4** | **`/4dm1n/pilotage`** | Tu **coches** : **FE-HUB-01** → FE-SPLIT → H19 → MOBILE-DA → **H14** |

Tout le reste de `docs/` est une **référence** : tu n’ouvres un fichier que quand DEPLOIEMENT ou TODOS te le demande.

```text
TODOS.md  ──►  MULTI-APPS-WEB-MOBILE.md  ──►  Pilotage FE-HUB / H19
                      │
                      └──► DEPLOIEMENT.md §0 puis §B (H14) quand structure OK
```

---

## Carte des dossiers

| Dossier | Pour quoi | Entrée typique |
|---------|-----------|----------------|
| **[operations/](operations/)** | Faire tourner / déployer / tester | **[DEPLOIEMENT.md](operations/DEPLOIEMENT.md)** |
| **[produit/](produit/)** | Comportement apps (Mail, Pass, Photos…) | [produit/README.md](produit/README.md) · **[MAIL-ALIAS.md](produit/MAIL-ALIAS.md)** |
| **[architecture/](architecture/)** | Comment c’est assemblé | **[MULTI-APPS-WEB-MOBILE.md](architecture/MULTI-APPS-WEB-MOBILE.md)** · [SERVICES.md](architecture/SERVICES.md) · [VERSIONNAGE-LIBS.md](architecture/VERSIONNAGE-LIBS.md) |
| **[securite/](securite/)** | Sécurité / secrets / crypto | [SECURITE.md](securite/SECURITE.md) · [SECRETS.md](securite/SECRETS.md) |
| **[decisions/](decisions/)** | Questionnaires & réponses | [multi-repo/REPONSES.md](decisions/multi-repo/REPONSES.md) |

Racine dépôt (hors `docs/`) : [`README.md`](../README.md) · [`TODOS.md`](../TODOS.md) · [`STATUS.md`](../STATUS.md) · [`BACKLOG.md`](../BACKLOG.md).

---

## Operations — fichiers utiles (après DEPLOIEMENT)

| Fichier | Quand |
|---------|--------|
| [operations/DEPLOIEMENT.md](operations/DEPLOIEMENT.md) | **Toujours** pour local / prod |
| [operations/PORTAINER-STACK-GIT-COMPLET.md](operations/PORTAINER-STACK-GIT-COMPLET.md) | Formulaire Portainer Git (champ par champ) |
| [operations/H14-GATEWAY-MOBILE.md](operations/H14-GATEWAY-MOBILE.md) | Gateway mobile LAN → HTTPS |
| [operations/DEPLOIEMENT-PAR-SERVICE.md](operations/DEPLOIEMENT-PAR-SERVICE.md) | `make deploy-web` / un service |
| [operations/ENV-GENERATION.md](operations/ENV-GENERATION.md) | `.env` / `env-prod` / secrets |
| [operations/PILOTAGE.md](operations/PILOTAGE.md) | Board `/4dm1n/pilotage` |
| [operations/VERSIONS-PROJET.md](operations/VERSIONS-PROJET.md) | Qui versionne quoi |
| [operations/TESTS.md](operations/TESTS.md) | Batterie de tests |
| [operations/PORTS-HOTES.md](operations/PORTS-HOTES.md) | Ports 60XX |
| [GIT.md](GIT.md) · [operations/BRANCHES.md](operations/BRANCHES.md) | Branches |

**Stubs** (anciens noms, redirigent) : `SUIVRE-ICI.md`, `GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md`, `DEPLOY-PORTAINER-NPM-CLOUDITY.md`, `DEPLOIEMENT-ENVIRONNEMENTS.md`, `DEPLOIEMENT-SUIVI.md`.

Référence longue VPS (optionnelle) : [operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md).

---

## Produit — fichiers utiles

| Fichier | Quand |
|---------|--------|
| **[produit/MAIL-ALIAS.md](produit/MAIL-ALIAS.md)** | **Toute** la doc alias mail (fiche unique) |
| [produit/MAIL-GMAIL-OAUTH.md](produit/MAIL-GMAIL-OAUTH.md) | OAuth Gmail |
| [produit/MOBILES.md](produit/MOBILES.md) | Apps Flutter |
| [produit/DRIVE-DESKTOP-SYNC.md](produit/DRIVE-DESKTOP-SYNC.md) | Sync bureau Drive |
| [produit/PHOTOS.md](produit/PHOTOS.md) · [ROADMAP.md](produit/ROADMAP.md) | Roadmap / Photos |
| [produit/editeur-docs.md](produit/editeur-docs.md) | Éditeur documents |
| [produit/CLOUDITY-USER-PREFERENCES.md](produit/CLOUDITY-USER-PREFERENCES.md) | Préférences utilisateur |

**Stubs alias** : `MAIL-ALIAS-VISION.md`, `…-DEMARRAGE`, `…-CHECKLIST`, `…-RECEPTION`, `…-REDIRECTION-SAFE`, `…-MTA` → tous pointent vers **MAIL-ALIAS.md**.

---

## Architecture / décisions / sécurité

| Besoin | Fichier |
|--------|---------|
| **Hub web + DA Flutter (priorité)** | [architecture/MULTI-APPS-WEB-MOBILE.md](architecture/MULTI-APPS-WEB-MOBILE.md) |
| Conteneurs & ports | [architecture/SERVICES.md](architecture/SERVICES.md) |
| SemVer libs | [architecture/VERSIONNAGE-LIBS.md](architecture/VERSIONNAGE-LIBS.md) |
| Layout backend / front | [BACKEND-LAYOUT.md](architecture/BACKEND-LAYOUT.md) · [FRONTEND-LAYOUT.md](architecture/FRONTEND-LAYOUT.md) · [ARCHITECTURE-FRONTENDS.md](architecture/ARCHITECTURE-FRONTENDS.md) |
| Choix multi-repo | [decisions/multi-repo/](decisions/multi-repo/) |
| Secrets | [securite/SECRETS.md](securite/SECRETS.md) |

---

## Convention (pour ne plus multiplier les .md)

1. **Un sujet = une fiche** (ou une section d’une fiche hub).
2. Nouvel ops « comment faire » → section dans **DEPLOIEMENT.md** ou lien depuis DEPLOIEMENT, pas un 5ᵉ guide parallèle.
3. Nouveau produit Mail alias → section dans **MAIL-ALIAS.md**.
4. Ancien fichier → **stub** d’une ligne vers la fiche, on ne supprime pas les URLs GitHub d’un coup.
5. Pilotage / TODOS restent le suivi **actionnable** ; `docs/` explique.

*Index remis à neuf — 2026-07-29.*
