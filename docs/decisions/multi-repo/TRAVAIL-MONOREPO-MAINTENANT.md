# Travailler en monorepo maintenant — déployer par brique — scinder plus tard

**Décision (2026-05-18)** : tant que **[QUESTIONNAIRE.md](QUESTIONNAIRE.md)** n’est pas entièrement exécuté en Phase 0, le dépôt **`Cloudity/` sur ton disque** reste **un seul monorepo Git**. Tu peux quand même **déployer chaque service séparément** (images Docker distinctes).

---

## 1. Ce qui ne change pas

| Aujourd’hui | Plus tard (multi-repo) |
|-------------|------------------------|
| Un clone `git clone …/Cloudity` | Meta-repo + sous-repos (submodules ou manifeste) |
| `docs/` centralisé ici | Docs réparties + meta-repo qui agrège |
| `make up` / `make deploy-*` | Même idée par **image** |
| Portainer : une stack par **service** | Idem — les images ne dépendent pas du découpage Git |

**Tu n’as pas besoin** du multi-repo pour :

- déployer `cloudity-web` seul sur le VPS ;
- garder toute la doc dans `docs/` ;
- développer mobile + extension dans les dossiers `mobile/`, `extensions/`.

---

## 2. Comment déployer « séparément » sans scinder Git

| Artefact | Dépôt (aujourd’hui) | Image / livrable |
|----------|---------------------|------------------|
| Front | `frontend/apps/cloudity-web` | `cloudity-web` |
| API | `backend/api-gateway` | `cloudity-api-gateway` |
| Mail | `backend/mail-directory-service` | `cloudity-mail-directory-service` |
| Pass | `backend/passwords-service` | `cloudity-passwords-service` |
| Mobile Mail | `mobile/mail` | APK (hors Docker) |
| Extension | `extensions/cloudity-pass` | ZIP / Chrome Web Store |

CI (futur ou présent) : workflow qui build **une image par Dockerfile** avec `context` limité au sous-dossier — même branche Git.

---

## 3. Ordre recommandé

1. **Stabiliser déploiement VPS** — **[DEPLOIEMENT-ENVIRONNEMENTS.md](../../operations/DEPLOIEMENT-ENVIRONNEMENTS.md)**.  
2. **Continuer produit** (Pass J8, Mail, alias).  
3. **Phase 0 multi-repo** — extraire `@cloudity/shared`, `dbpin`, etc. ([MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)).  
4. Scinder les repos Git **sans** changer la façon dont Portainer pull les images.

---

## 4. Où mettre les réponses questionnaire

Remplis **[REPONSES.md](REPONSES.md)** quand tu tranches — jusqu’alors, considère **Q1=A + Q2=D + Q3=A** comme hypothèse de travail (déjà cochées dans le questionnaire).

---

*Dernière mise à jour : 2026-05-18.*
