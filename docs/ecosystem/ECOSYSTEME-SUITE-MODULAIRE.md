# Écosystème Cloudity — organisation, données, Cursor, Portainer & migration

> **Rapport de cadrage (v2 — 2026-09-15)**  
> Destinataires : **non publiés** (adresses perso / ops uniquement via variables d’env locales — jamais en repo).  
> Statut : **analyse + recommandations** — **aucune migration destructive** tant que les décisions §17 ne sont pas tranchées.  
> Index doc Cloudity : [`docs/INDEX.md`](docs/INDEX.md)

Ce document remplace et **étend** la v1 : audit **local + GitHub + VPS**, règles **zéro perte de données**, usage **Cursor** (global / unitaire), déploiement **Portainer Git only**, et plan d’intégration des satellites **sans fusionner les historiques utilisateurs**.

---

## 0. Résumé exécutif (à lire absolument)

1. **Quatre produits déjà en prod sur le même VPS**, stacks Docker **séparées**, volumes **séparés** — c’est déjà proche du modèle cible « apps indépendantes ».
2. Données critiques mesurées le **2026-09-15** sur `vmi1296373` :
   - `ytmusic_ytmusic_data` ≈ **20,6 Go**
   - `gasoil_api_data` ≈ **8,9 Go**
   - `jobbingtrack-prod_postgres_data` ≈ **537 Mo** (+ preprod ≈ **465 Mo**)
   - `cloudity_postgres_data` ≈ **49 Mo** (+ `cloudity_mobile_data` ≈ **678 Mo**)
3. **Interdit** : `docker compose down -v`, « Remove volumes » Portainer, rename de volume à la volée, monorepo qui écrase les stacks.
4. **Recommandé** : meta-dossier / meta-repo **ClouditySuite** + **submodules** ; naming **Cloudity + noms clairs** (pas Adminity/Gatewaydity) ; Maps = OSM + routing open ; Waze = deep link seulement.
5. Hygiène doc Cloudity : index `docs/INDEX.md` ; anciens récaps déplacés dans `reports/progress/archive/` (conservés).

---

## 1. Inventaire des projets (local / Git / VPS)

| Produit | Chemin local | Repo GitHub | Branches utiles | Stack Docker VPS | Volume(s) données | Domaine(s) |
|---------|--------------|-------------|-----------------|------------------|-------------------|------------|
| **Cloudity** (suite) | `…/Perso/Cloudity/Cloudity` | `PavelDelhomme/Cloudity` | `dev`, `prod`, `chore/restructure-platform`… | projet `cloudity` | `cloudity_postgres_data`, `cloudity_mobile_data`, `cloudity_redis_data`, `cloudity_auth_keys` | `cloudity.delhomme.ovh` (200) |
| **GasoilTracking** | `…/Perso/GasoilTracking` | `PavelDelhomme/GasoilTracking` | `prod`, `preprod` (**pas de `dev` historique** → à créer) | `gasoil-tracking` | **`gasoil_api_data` (~8,9 Go)** | `gasoil-tracking.delhomme.ovh` (200) |
| **YTMusic / PLM** | `…/Perso/YTMusic` | `PavelDelhomme/YTMusic` | `dev`, nombreuses feat/* | `ytmusic` (conteneur `ytmusic`) | **`ytmusic_ytmusic_data` (~20,6 Go)** | `plm.delhomme.ovh` + alias `ytmusic.delhomme.ovh` (200) |
| **JobbingTrack** | `…/Perso/JobbingTrack` | `PavelDelhomme/JobbingTrack` | `dev`, `docs/*`, … | `jobbingtrack-prod` + `jobbingtrack-preprod` | `jobbingtrack-prod_postgres_data`, `…-preprod_…`, releases APK | stacks Portainer dédiées |

### 1.1 Montage volumes (VPS) — à ne jamais casser

| Conteneur | Volume Docker | Destination dans le conteneur |
|-----------|---------------|-------------------------------|
| `cloudity-postgres` | `cloudity_postgres_data` | `/var/lib/postgresql/data` |
| `ytmusic` | `ytmusic_ytmusic_data` | `/app/data` |
| `gasoil-tracking-api` | `gasoil_api_data` | `/data` |
| `jobbingtrack-prod-postgres` | `jobbingtrack-prod_postgres_data` | `/var/lib/postgresql/data` |
| `jobbingtrack-preprod-postgres` | `jobbingtrack-preprod_postgres_data` | `/var/lib/postgresql/data` |

Code / compose côté serveur (exemples observés) :

- Cloudity : projet compose `cloudity` (images GHCR `:latest`)
- Gasoil : `/home/pavel/apps/gasoil-tracking`
- JobbingTrack : `/home/pavel/stacks/jobbingtrack-files`
- YTMusic/PLM : volume nommé `ytmusic_ytmusic_data` (SQLite/cache dans `/app/data`)

### 1.2 Règle d’or « zéro perte »

Pour **chaque** produit, avant toute « intégration suite » :

1. Snapshot volume : `docker run --rm -v VOL:/v -v /backup:/b alpine tar czf /b/VOL-$(date +%Y%m%d).tgz -C /v .`
2. Vérifier restore dry-run sur un volume `_restore_test`.
3. Redeploy Portainer **sans** cocher Remove volumes.
4. Garder les **noms de volumes Docker** stables même si le produit est renommé en UI (« Fuel Track », « PLM »).
5. DNS / domaines : dual alias le temps de la migration (comme déjà `plm` + `ytmusic`).

---

## 2. Naming (recommandation inchangée, clarifiée)

### 2.1 À éviter

`Adminity`, `Gatewaydity`, `Authdity`, `Calendity`, `Tachedity`, etc. — peu mémorisables, cassent marques/DNS/packages déjà en prod.

### 2.2 Option recommandée — marque **Cloudity** + noms clairs

| Rôle | Nom UI | Code / image |
|------|--------|--------------|
| Suite / hub | Cloudity | `cloudity` |
| Admin | Cloudity Console | `cloudity-admin` |
| Gateway | Cloudity Edge | `cloudity-gateway` |
| Auth SSO | Cloudity ID | `cloudity-auth` |
| Mail / Drive / Notes / Pass / Photos / Tasks / Agenda / Contacts | Cloudity &lt;Produit&gt; | `cloudity-*` existants |
| Cartes (nouveau) | **Cloudity Maps** | `cloudity-maps` |
| Carburant | **Fuel Track** (ex-GasoilTracking) | repo `GasoilTracking` inchangé au début |
| Musique | **PLM** | repo `YTMusic` inchangé au début |
| Emploi | **JobbingTrack** | repo inchangé |

### 2.3 Option B (suffixe -ity sélectif)

Seulement pour **nouveaux** produits marketing si tu y tiens : Melodity, Fuelity, Candidity — **jamais** en phase 0 sur les volumes/repos existants.

---

## 3. Organisation des répertoires (cible)

### 3.1 Sur le PC (développement)

```text
/home/pactivisme/Documents/Dev/Perso/
├── ClouditySuite/                 # NOUVEAU — meta (docs + Makefile + .code-workspace)
│   ├── README.md
│   ├── ClouditySuite.code-workspace
│   ├── Makefile                   # clone-all / status / open-*
│   ├── docs/                      # copie ou lien vers ce rapport
│   └── products/                  # submodules OU symlinks
│       ├── cloudity  → ../Cloudity/Cloudity
│       ├── fuel      → ../GasoilTracking
│       ├── music     → ../YTMusic
│       └── jobs      → ../JobbingTrack
├── Cloudity/Cloudity/             # repo actuel (inchangé comme Git root)
├── GasoilTracking/
├── YTMusic/                       # = PLM
└── JobbingTrack/
```

Tu peux continuer à ouvrir **un seul** dossier produit dans Cursor ; le meta sert à la vue globale.

### 3.2 Dans le monorepo Cloudity (déjà là + cible)

```text
Cloudity/
├── ECOSYSTEME-SUITE-MODULAIRE.md  # ce fichier
├── docs/INDEX.md                  # navigation
├── backend/*-service/             # services (renommage dossiers = phase tardive)
├── frontend/apps/
│   ├── cloudity-web/              # hub (encore gros)
│   ├── web-mail/ · web-drive/     # déjà extraits
│   └── web-maps/                  # cible
├── mobile/
└── deploy/portainer/              # GitOps
```

Les apps satellites **ne sont pas** copiées dans Cloudity.git : elles restent des repos ; le hub Cloudity ne fait que les **lier** (SSO, tuiles, deep links).

### 3.3 Sur le VPS (déjà vrai — à préserver)

```text
Stacks indépendantes :
  cloudity          → volumes cloudity_*
  gasoil-tracking   → volume gasoil_api_data
  ytmusic           → volume ytmusic_ytmusic_data
  jobbingtrack-prod / jobbingtrack-preprod → volumes JT_*
```

La « migration suite » = **orchestration + SSO + docs**, **pas** fusion des volumes.

---

## 4. Comment ouvrir / travailler (Cursor & Git)

### 4.1 Un produit seul (quotidien)

```bash
# Exemple PLM
cd ~/Documents/Dev/Perso/YTMusic
cursor .          # ou File → Open Folder
git checkout dev
make dev          # selon Makefile du projet
```

Idem Gasoil (`prod` ou futur `dev`), JobbingTrack (`dev`), Cloudity (`chore/restructure-platform` ou `dev`).

### 4.2 Vue globale (meta)

1. Créer `ClouditySuite.code-workspace` :

```json
{
  "folders": [
    { "path": "products/cloudity", "name": "Cloudity" },
    { "path": "products/GasoilTracking", "name": "Fuel-GasoilTracking" },
    { "path": "products/YTMusic", "name": "PLM-YTMusic" },
    { "path": "products/jobs", "name": "JobbingTrack" }
  ],
  "settings": { "files.exclude": { "**/node_modules": true } }
}
```

2. `cursor ClouditySuite.code-workspace`  
→ multi-root : recherche / git par dossier, commits **dans le bon repo**.

### 4.3 Règles pour ne pas se marcher dessus

| Action | OK | Interdit |
|--------|----|----------|
| Modifier UI Fuel | repo GasoilTracking | Impporter le monolithe Cloudity en dur |
| SSO | SDK `identity` versionné (semver) | Copier-coller JWT secrets entre `.env` |
| Commit | dans le repo du produit | Un seul commit « fourre-tout » cross-repos |
| Push | branche du produit (`dev` / `prod`) | Forcer push sur `main`/`prod` sans revue |

### 4.4 Ajouter une future app dans la suite

1. Nouveau repo GitHub autonome + compose Portainer Git.  
2. Entrée dans `ClouditySuite/products/<slug>` (submodule).  
3. Client OIDC Cloudity ID + tuile hub.  
4. Doc une page dans `docs/produit/`.  
→ Objectif : **&lt; 1 jour** de glue si le SDK existe.

---

## 5. Déploiement Portainer — Git only (recommandation)

### 5.1 Modèle déjà utilisé (à généraliser)

| Produit | Mode cible | Notes VPS |
|---------|------------|-----------|
| Cloudity | Portainer Git → `docker-compose.ghcr.yml` + env stack | Projet compose `cloudity` ; **ne pas vider** les env vars |
| Gasoil | Git / webhook (`make deploy`) | Images locales `gasoil-tracking-*:1.4.136` observées |
| PLM/YTMusic | Compose + volume data | Conteneur `ytmusic` healthy |
| JobbingTrack | Portainer preprod + prod | Tags `dev` / `latest` / `local-ops-*` — à homogénéiser plus tard |

### 5.2 Checklist redeploy **sans perte**

1. Backup volume (§1.2).  
2. Portainer → Edit stack → **ne pas** cocher Remove volumes / Remove images sauf purge contrôlée.  
3. Pull image **nouvelle** uniquement.  
4. Smoke HTTP 200 + login + 1 lecture donnée critique.  
5. Si rollback : re-tag image précédente, **mêmes** noms de volumes.

### 5.3 Ce que « intégrer dans Cloudity » **ne** veut **pas** dire

- ❌ Un seul stack Portainer « tout-en-un » qui recrée les DB.  
- ❌ Renommer `ytmusic_ytmusic_data` → `plm_data` sans procédure de copie.  
- ❌ Déplacer Gasoil dans le compose Cloudity du jour au lendemain.

- ✅ Tuiles hub + OIDC + contrats API.  
- ✅ Meta-repo docs/CI de compatibilité.  
- ✅ Plus tard : stack « umbrella » **health-only** (optionnel).

---

## 6. Cloudity Maps & GasoilTracking

### 6.1 Maps

- UX type **Mappy** / **Google Maps**, moteur **OSM** (MapLibre), offline type **OsmAnd**, objectif F-Droid = libs OSS.  
- Routing : OSRM / Valhalla / OpenRouteService.  
- **Waze** : deep link `waze://` / URL uniquement — **pas** d’API publique pour cloner Waze.

### 6.2 Gasoil ↔ Maps

| Phase | Action | Données |
|-------|--------|---------|
| 0 | Rien de destructif | Volume `gasoil_api_data` inchangé |
| 1 | SSO Cloudity ID opt-in | Comptes locaux Fuel conservés |
| 2 | API trips → Maps | Lecture/écriture versionnée ; Fuel reste source de vérité carburant |
| 3 | Layer dans Maps | App Fuel solo toujours installable |

---

## 7. PLM (YTMusic) — continuité utilisateurs

- Repo GitHub : **garder** `YTMusic` tant que CI/Portainer y pointent ; marque UI = **PLM**.  
- Volume **20,6 Go** : caches + bibliothèque + sessions — **backup avant toute manip**.  
- SSO Cloudity = **parallèle** au login actuel.  
- Domaines : garder `plm.delhomme.ovh` **et** `ytmusic.delhomme.ovh`.

---

## 8. JobbingTrack — continuité + lien suite

- Stacks **prod + preprod** déjà séparées (bon modèle).  
- Postgres prod/preprod = données candidatures — backup avant SSO.  
- Inscription : compte Jobs **toujours** ; Cloudity ID **opt-in**.  
- Intégrations futures : Mail (relances), Agenda (entretiens), scopes OAuth limités.

---

## 9. Trois architectures (rappel)

| Option | Description | Verdict |
|--------|-------------|---------|
| **1 Meta-repo + submodules** | `ClouditySuite` pointe vers 4 repos | **Recommandée** |
| **2 Monorepo unique** | Tout dans Cloudity.git | **Non** (risque users PLM/Fuel/Jobs) |
| **3 Symlinks locaux only** | Pas de Git meta | Étape 0 acceptable |

---

## 10. Couche plateforme (glue)

1. **Cloudity ID** (OIDC) — clients par app.  
2. **SDK** JS + Dart (login/refresh/logout).  
3. **Webhooks / API** mail & calendar (scopes).  
4. **Design tokens** partagés (UX uniforme sans rewrite).  
5. Hub Cloudity : tuiles PLM / Fuel / Jobs / Maps.

---

## 11. Hygiène documentation Cloudity (fait dans ce passage)

| Action | Détail |
|--------|--------|
| Index | `docs/INDEX.md` créé |
| Archive | `reports/progress/archive/` ← anciens `recap-*`, `roadmap-email-*`, `session-email-*` |
| Conservé | `STATUS.md`, `TODOS.md`, `BACKLOG.md`, `DEPLOIEMENT_PROCEDURE.md`, `README.md` |
| Pointeur | `DEPLOY.md` reste un lien court |
| Ce rapport | `ECOSYSTEME-SUITE-MODULAIRE.md` (v2) |

Ne pas rouvrir l’archive sauf audit historique.

---

## 12. Comment sera organisé le « parent » côté GitHub (proposition)

```text
PavelDelhomme/ClouditySuite          # meta (docs, workspace, Makefile)
PavelDelhomme/Cloudity               # suite (déjà)
PavelDelhomme/GasoilTracking         # fuel (déjà)
PavelDelhomme/YTMusic                # PLM (déjà)
PavelDelhomme/JobbingTrack           # jobs (déjà)
PavelDelhomme/cloudity-maps          # nouveau quand Phase Maps démarre
```

Submodules dans `ClouditySuite/products/*` — chaque CI reste dans son repo. Portainer continue de tracker **chaque** repo séparément (Git only).

---

## 13. Plan de migration (sans perte) — ordre imposé

### Phase 0 — Cadrage (maintenant)

- [x] Audit VPS volumes / stacks  
- [x] Hygiène `.md` Cloudity  
- [x] Rapport v2 + email  
- [ ] **Tes décisions §17** (obligatoires avant code)

### Phase 1 — Sécurité des données

- [ ] Script `backup-all-suite-volumes.sh` sur VPS (cron hebdo)  
- [ ] Documenter restore test pour YTMusic + Gasoil + JT prod  
- [ ] Créer branche `dev` GasoilTracking (depuis `prod`) pour aligner le flux

### Phase 2 — Meta local + Cursor workspace

- [ ] Dossier `ClouditySuite` + `.code-workspace`  
- [ ] Symlinks ou submodules  
- [ ] README « ouvrir global / unitaire »

### Phase 3 — Cloudity ID (SSO) pilote

- [ ] Un seul satellite (Fuel **ou** PLM web) en opt-in  
- [ ] Aucune invalidation des sessions existantes

### Phase 4 — Maps MVP + lien Fuel

- [ ] `maps-service` + web  
- [ ] API trips ; volume Gasoil **intact**

### Phase 5 — Jobs ↔ Mail/Agenda

- [ ] Scopes OAuth ; pas de copie totale de boîte mail

### Phase 6 — Uniformisation UX / éventuels renommages

- [ ] Tokens UI  
- [ ] Renommages dossiers services **uniquement** avec dual-support

---

## 14. Risques

| Risque | Gravité | Mitigation |
|--------|---------|------------|
| Perte volume YTMusic 20 Go | Critique | Backup + jamais Remove volumes |
| Perte Gasoil 9 Go | Critique | Idem |
| Confusion branches (Gasoil sans `dev`) | Haute | Créer `dev` ; Portainer reste sur `prod` |
| Monorepo big-bang | Haute | Interdit |
| SSO forcé PLM | Haute | Opt-in only |
| Waze ToS | Moyenne | Deep link only |
| Trop de `.md` | Moyenne | Index + archive (fait) |

---

## 15. Critères de succès

1. Backup restore test OK sur YTMusic + Gasoil.  
2. Workspace Cursor global ouvre 4 racines sans mélanger les commits.  
3. Chaque produit se développe **seul** (`make dev`).  
4. Redeploy Portainer Git d’un produit **ne touche pas** aux volumes des autres.  
5. User PLM / Fuel / Jobs existant : **mêmes données** après SSO opt-in.  
6. Tuiles hub Cloudity pointent vers les apps (deep link) sans héberger leur DB.

---

## 16. Recommandations clés (synthèse opérationnelle)

1. **Ne rien fusionner** des volumes Docker existants.  
2. **Meta-repo / dossier ClouditySuite** pour l’humain et Cursor ; stacks Portainer **restent séparées**.  
3. Naming **Cloudity X** ; satellites gardent PLM / GasoilTracking / JobbingTrack en code Git.  
4. Maps OSS ; Waze = external navigate.  
5. SSO **opt-in** partout.  
6. Doc : un index, archive des récaps, ce fichier comme boussole.  
7. Déploiement : **Git → Portainer** par produit ; checklist anti-Remove-volumes.  
8. Avant code : répondre §17.

---

## 17. Décisions à trancher **avant** implémentation

Réponds quand tu peux (email / issue) — **sans ça on n’implémente pas** la suite :

1. **Naming** : Option A Cloudity+clairs (reco) / B -ity / C nouvelle marque ombrelle ?  
2. **Meta** : créer repo GitHub `ClouditySuite` tout de suite, ou d’abord dossier local + workspace ?  
3. **Premier SSO** : PLM, Fuel, ou JobbingTrack ?  
4. **Maps** : démarrer **dans** Cloudity.git (`maps-service`) ou repo `cloudity-maps` dès le jour 1 ?  
5. **Gasoil** : créer branche `dev` (oui reco) tout en laissant Portainer sur `prod` ?  
6. **F-Droid Maps** : contrainte dure (libs OSS) ou nice-to-have ?  
7. **JobbingTrack** : preprod/prod restent 2 stacks (reco oui) ?  
8. **Calendrier** : OK pour Phase 1 backups volumes cette semaine sans toucher au code produit ?

---

## 18. Annexes techniques (snapshot 2026-09-15)

### 18.1 Conteneurs « suite » vus sur le VPS

- Cloudity : web healthy, postgres/redis healthy, services up, init exited 0 (normal).  
- Gasoil : `gasoil-tracking-api` + `web` healthy (~1h uptime au moment de l’audit).  
- YTMusic : `ytmusic` healthy (~2h).  
- JobbingTrack : preprod + prod complets (gateway/frontend healthy).

### 18.2 HTTP

Tous les domaines testés en **200** : cloudity, gasoil-tracking, plm, ytmusic.

### 18.3 Fichiers poussés avec ce cadrage

- Cloudity : ce MD + `docs/INDEX.md` + archive progress.  
- Chaque satellite : fiche `docs/SUITE-ECOSYSTEM-LINK.md` (lien vers ce rapport + règles données).

---

*— Fin du rapport v2 — ne pas supprimer ; mettre à jour le §18 après chaque audit volumes —*
