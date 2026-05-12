# Cloudity — Versionnage des bibliothèques partagées

**Rôle** : décrire la convention de versionnage **SemVer** appliquée aux bibliothèques partagées Cloudity (`internalsec`, `pkg/dbpin`, `@cloudity/shared`, `cloudity_shared` Dart) et la logique d'évolution **avant et après publication publique**.

> Décision actée : **REPONSES.md Q4=B** (publication publique sur npm.org / pub.dev / Go publics) et **Q10=A** (Phase 0 immédiate).
> Plan global : **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)** § 4 (Phase 0).

---

## 1. Bibliothèques concernées

| Bibliothèque | Stack | Chemin actuel | Version Cloudity courante | Publication cible |
|--------------|-------|---------------|---------------------------|-------------------|
| **`internalsec`** | Go | `backend/internalsec/` | **0.1.0** *(VERSION + CHANGELOG)* | tag Git public `internalsec/v0.1.0` sur dépôt `cloudity-internalsec` |
| **`pkg/dbpin`** | Go | `backend/pkg/dbpin/` | **0.1.0** *(CHANGELOG)* | tag Git public `pkg/dbpin/v0.1.0` sur dépôt `cloudity-pkg-dbpin` |
| **`@cloudity/shared`** | TS / React | `frontend/packages/cloudity-shared/` | **0.1.0** *(`package.json`)* | `npm publish @cloudity/shared@0.1.0` sur npm.org |
| **`cloudity_shared`** | Dart / Flutter | `mobile/cloudity_shared/` | **0.1.0** *(`pubspec.yaml`)* | `dart pub publish` sur pub.dev |

---

## 2. Convention SemVer

Cloudity suit **strictement** [SemVer 2.0.0](https://semver.org/lang/fr/) pour ces 4 libs :

- **MAJOR (`X.0.0`)** : **rupture** d'API publique. Bump uniquement quand des consommateurs doivent modifier leur code.
- **MINOR (`0.X.0`)** : ajout d'API ou modification **non destructive**. Les consommateurs peuvent passer du `0.1.0` au `0.2.0` sans changer leur code.
- **PATCH (`0.0.X`)** : correction de bug ou amélioration interne sans changement d'API.

**Règles internes Cloudity** (en plus de SemVer) :

1. **Phase 0.x** : tant que la lib est en `0.x.y`, on autorise des **changements mineurs en MINOR** (ex. retirer une fonction non documentée). À partir de `1.0.0`, **toute** rupture force un MAJOR.
2. **Mention `BREAKING CHANGE` obligatoire** dans le CHANGELOG (avec migration guide) pour tout MAJOR.
3. **CHANGELOG** mis à jour **avant** le bump de version (jamais après).

---

## 3. Statut **avant publication publique** (aujourd'hui)

> **Aucune** lib n'est publiée tant que l'**organisation GitHub finale** n'est pas fixée (cf. **REPONSES.md** texte libre § 1).

Conséquences concrètes :

- `package.json` : `"private": true` reste actif (npm bloque la publication accidentelle).
- `pubspec.yaml` : `publish_to: 'none'` reste actif (pub.dev bloque la publication accidentelle).
- Modules Go : aucun tag Git `internalsec/v*` ni `pkg/dbpin/v*` n'est poussé sur `origin`. Les consommateurs internes utilisent `replace … => ../<lib>` dans leur `go.mod` + `go.work`.
- Apps Flutter mobile : `pubspec.yaml` consomme la lib via `path: ../cloudity_shared`.
- Apps TS web : `package.json` consomme la lib via `"@cloudity/shared": "*"` + entrée workspaces.

**Ce que les bumps `0.1.0` apportent malgré l'absence de publication** :

- Trace contractuelle de l'API stabilisée à un instant donné.
- Permet aux scripts CI de **vérifier** qu'aucun PR n'introduit un changement d'API sans bumper le CHANGELOG.
- Préparation propre du jour où on poussera les tags / `npm publish` / `dart pub publish`.

---

## 4. Statut **après publication publique** (futur déclencheur)

Quand l'organisation GitHub publique sera fixée (et après nettoyage de toute donnée sensible inadvertante dans les libs), on déclenche :

### 4.1 `internalsec` et `pkg/dbpin` (Go)

```bash
# Sur le dépôt cible (cloudity-internalsec, cloudity-pkg-dbpin) :
git tag -a v0.1.0 -m "Initial public release"
git push origin v0.1.0
```

Les services Go consommateurs basculent leur `go.mod` :

```diff
- replace github.com/cloudity/internalsec => ../internalsec
+ require github.com/cloudity/internalsec v0.1.0
```

### 4.2 `@cloudity/shared` (npm)

```bash
cd frontend/packages/cloudity-shared
# Désactiver "private" temporairement :
npm pkg delete private
npm publish --access public
# Réactiver :
npm pkg set private=true
```

Les apps web consommatrices basculent leur `package.json` :

```diff
- "@cloudity/shared": "*"
+ "@cloudity/shared": "^0.1.0"
```

### 4.3 `cloudity_shared` (pub.dev)

```bash
cd mobile/cloudity_shared
# Désactiver publish_to: 'none' temporairement :
sed -i "s/^publish_to: 'none'$/# publish_to: enable/" pubspec.yaml
dart pub publish
# Réactiver après publication :
git checkout pubspec.yaml
```

Les apps mobile consommatrices basculent :

```diff
  cloudity_shared:
-   path: ../cloudity_shared
+   ^0.1.0
```

---

## 5. Workflow de bump de version

### 5.1 Avant chaque release (release = mise à jour du CHANGELOG + bump fichier de version)

1. Identifier la nature des changements depuis la dernière version (PATCH / MINOR / MAJOR).
2. Mettre à jour le `CHANGELOG.md` de la lib avec la nouvelle entrée datée (`## [X.Y.Z] — YYYY-MM-DD`) et les sections `Ajouté` / `Modifié` / `Déprécié` / `Retiré` / `Corrigé` / `Sécurité` selon Keep a Changelog.
3. Bumper le fichier de version selon la stack :
   - **Go** : `backend/internalsec/VERSION` + (futur) tag Git `internalsec/vX.Y.Z`.
   - **TS** : `frontend/packages/cloudity-shared/package.json` champ `version`.
   - **Dart** : `mobile/cloudity_shared/pubspec.yaml` champ `version`.
4. Commit avec message `chore(<lib>): bump to vX.Y.Z` + référence aux fichiers CHANGELOG.

### 5.2 Si publication publique active (futur)

Après les étapes 1–4 ci-dessus, exécuter le workflow de § 4 selon la lib.

---

## 6. Vérifications CI — `scripts/ci/check-versioning.sh`

**Livré (2026-05-12)** : `scripts/ci/check-versioning.sh` couvre exactement ces 4 libs.

Comportement :

| Lib | Fichiers source surveillés | Fichier de version | CHANGELOG |
|-----|----------------------------|--------------------|-----------|
| `internalsec` | `backend/internalsec/*.go` | `backend/internalsec/VERSION` | `backend/internalsec/CHANGELOG.md` |
| `pkg/dbpin` | `backend/pkg/dbpin/*.go` | *(tag Git futur — pas de fichier dédié)* | `backend/pkg/dbpin/CHANGELOG.md` |
| `@cloudity/shared` (TS) | `frontend/packages/cloudity-shared/src/**` | `frontend/packages/cloudity-shared/package.json` (champ `version`) | `frontend/packages/cloudity-shared/CHANGELOG.md` |
| `cloudity_shared` (Dart) | `mobile/cloudity_shared/lib/**` | `mobile/cloudity_shared/pubspec.yaml` (champ `version:`) | `mobile/cloudity_shared/CHANGELOG.md` |

Le script unionne 3 sources de diff (`merge-base...HEAD` + index `--cached` + working tree) pour fonctionner aussi bien en CI qu'en local avant `git add`.

Modes :

- **WARNING** (par défaut, local) : exit 0, message `⚠️` listant les libs sans bump.
- **BLOCKING** : `CHECK_VERSIONING_BLOCKING=1 ./scripts/ci/check-versioning.sh` → exit 1 sur oubli (à brancher en CI / pre-push).

Variables :

- `BASE_REF` : ref de comparaison (défaut : `origin/main` → `origin/master` → `main` → `master` → `HEAD~1`).
- `CHECK_VERSIONING_VERBOSE=1` : liste les fichiers modifiés par lib.

Cibles Make :

- **`make check-versioning`** : lance le script en mode warning.
- **`make test-security`** : intègre le check (mode WARNING ; `CHECK_VERSIONING_BLOCKING=1` propagé si exporté).

---

## 7. Références croisées

- Plan multi-repo et phases : **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)**.
- Décisions versionnage / publication : **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** § Q4 (publication publique), § Q10 (Phase 0 immédiate).
- Conventions backend Go + statut `pkg/dbpin` : **[BACKEND-LAYOUT.md](BACKEND-LAYOUT.md)** § 4.
- Conventions frontend : **[FRONTEND-LAYOUT.md](FRONTEND-LAYOUT.md)**.

---

*Document à mettre à jour à chaque bump de version d'une des 4 libs (référence unique).*
