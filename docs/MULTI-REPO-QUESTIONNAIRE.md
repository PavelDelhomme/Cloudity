# Questionnaire — décisions multi-repos Cloudity

**Rôle** : trancher les choix listés dans **[MULTI-REPO-LAYOUT.md](./MULTI-REPO-LAYOUT.md)** § 10 avant d’engager la **Phase 0** (extraction `pkg/dbpin`, versionnage des libs, etc.).

**Mode d’emploi** : pour chaque question, **coche une seule option** (sauf si « Plusieurs » est explicitement proposé). Copie ce fichier dans une issue GitHub ou remplis-le en local puis communique les lettres (ex. `Q1=A, Q2=B, …`). La **Phase 0** peut démarrer dès que les Q1–Q10 sont renseignées ; le bloc **texte libre** en fin de fichier est **optionnel** mais utile pour les nuances.

---

## Q1 — Stratégie de dépôts (court / moyen terme)

- [ ] **A** — Polyrepo : **meta-repo** + sous-dépôts reliés par **`git submodule`** (un commit figé par sous-projet ; `git clone --recurse-submodules`).
- [ ] **B** — Polyrepo : meta-repo + sous-dépôts reliés par **`git subtree`** (copie importée ; pas de sous-module à l’usage quotidien).
- [ ] **C** — Polyrepo : meta-repo + outil **manifeste** (`meta`, `mu-repo`, `repo` Google, etc.) — pas de submodule Git natif.
- [ ] **D** — **Rester en monorepo** pour l’instant : `CODEOWNERS`, CI par chemins, branches par domaine ; scission **plus tard** quand les libs sont versionnées.

---

## Q2 — Granularité des dépôts **backend** (services Go + admin Python)

- [ ] **A** — **Un dépôt par microservice** (~11 dépôts : gateway, auth, passwords, mail-directory, drive, photos, calendar, contacts, notes, tasks, admin-service).
- [ ] **B** — **Trois regroupements** : (1) `auth` + `passwords` ; (2) `mail-directory` + `contacts` + `calendar` + `notes` + `tasks` ; (3) `drive` + `photos` ; **gateway** et **admin-service** restent séparés (total ~6 dépôts métier + gateway + admin).
- [ ] **C** — **Deux regroupements** : « **comm** » (mail + contacts + calendar + notes + tasks) et « **fichiers** » (drive + photos + pass côté API si un jour fusionné — **non recommandé** tant que Pass est un service distinct) — à n’utiliser que si tu acceptes des PR plus larges.
- [ ] **D** — **Monorepo backend** (`cloudity-backend`) avec dossiers par service ; scission uniquement **front** / **mobile** / **extensions**.

---

## Q3 — Granularité des dépôts **mobile** (Flutter)

- [ ] **A** — **Un dépôt par application** (`cloudity-mobile-mail`, `…-drive`, `…-photos`, `…-pass`, `…-admin`, etc.).
- [ ] **B** — **Un seul dépôt** `cloudity-mobile` avec `apps/mail`, `apps/drive`, `apps/photos`, … et package partagé en workspace interne.
- [ ] **C** — **Hybride** : apps « matures » (mail, drive, photos) en repos séparés ; apps naissantes (pass, futur hub) dans un repo `cloudity-mobile-incubator` jusqu’à stabilisation.

---

## Q4 — **Registry** pour les artefacts partagés (npm, Dart, Go)

- [ ] **A** — **GitHub Packages** (privé) pour `@cloudity/*`, éventuellement images GHCR ; Go : modules privés sur `github.com/<org>/…` avec tags `v*`.
- [ ] **B** — **Public** dès que possible : **npm** + **pub.dev** (pour `cloudity_shared`) + tags Go publics sur GitHub.
- [ ] **C** — **Hybride** : GitHub Packages pour le privé **aujourd’hui** ; bascule npm/pub.dev **quand** le code sera ouvert ou partiellement ouvert.

---

## Q5 — Emplacement de **`infrastructure/`** (Postgres, migrations, reverse-proxy, step-ca)

- [ ] **A** — **Tout reste dans le meta-repo** Cloudity (recommandé par défaut : une seule vérité pour les migrations SQL).
- [ ] **B** — **Dépôt séparé** `cloudity-infra` (accès restreint, stacks Portainer, secrets hors code applicatif) ; le meta-repo ne garde que `docker-compose` dev minimal.
- [ ] **C** — **Hybride** : migrations + schéma dans le meta-repo ; **templates** NPM / Portainer / prod dans `cloudity-infra`.

---

## Q6 — **CI** (GitHub Actions)

- [ ] **A** — **Workflow par dépôt** + un workflow **d’orchestration** dans le meta-repo (déclenche les autres ou agrège les statuts).
- [ ] **B** — **Principalement le meta-repo** : un job clone les sous-dépôts (ou checkout submodules) et lance `make test` global.
- [ ] **C** — **Hybride** : CI unitaire **dans chaque dépôt** ; E2E / stack complète **uniquement** dans le meta-repo (nightly + avant release).

---

## Q7 — **Portainer** + **nginx-proxy-manager** (prod)

- [ ] **A** — **Une stack Docker unique** (tous les services dans un seul `docker-compose` Portainer) — simple, redéploiement global.
- [ ] **B** — **Plusieurs stacks** (ex. `stack-core` Postgres/Redis, `stack-edge` NPM, `stack-api` gateway+services, `stack-web` front) — redémarrages ciblés.
- [ ] **C** — **Stacks par domaine produit** (Mail, Drive, Pass, Photos, Office, Identity, Infra) — maximum d’isolation, plus de coordination.

---

## Q8 — **Backups** automatisés + pilotage UI

- [ ] **A** — **Conteneur dédié** `cloudity-backup` (**Restic** + snapshots PG) ; API **`admin-service`** pour « lancer maintenant », plan, restauration contrôlée (comme décrit dans MULTI-REPO-LAYOUT § 8.3).
- [ ] **B** — **Restic uniquement** en cron sur l’hôte / stack infra, **sans** panneau Cloudity au début (UI plus tard).
- [ ] **C** — **Autre outil** (ex. BorgBackup, Kopia) — préciser en **texte libre** § remarques.

---

## Q9 — **Extension navigateur Pass** + **application Linux** (desktop)

**Quand démarrer le chantier** (indépendamment de la scission Git) :

- [ ] **A** — **Avant** la scission multi-repo (le code vit encore dans le monorepo, dossiers `extensions/` et `desktop/`).
- [ ] **B** — **Après** la Phase 0 (libs versionnées) mais **avant** la scission complète des services.
- [ ] **C** — **Après** la scission des repos **front** / **outillage** seulement.
- [ ] **D** — **Plus tard** (après stabilisation Mail / Photos / Pass web).

**Stack desktop Linux** (une option) :

- [ ] **T1** — **Tauri** (Rust + WebView ; binaire léger).
- [ ] **T2** — **Electron** (écosystème large, empreinte plus lourde).
- [ ] **T3** — **Pas encore décidé** / étude de faisabilité (GTK/Qt natif hors scope court terme).

---

## Q10 — **Calendrier** de la Phase 0 (extraction `pkg/dbpin` + versionnage `internalsec`, `@cloudity/shared`, `cloudity_shared`)

- [ ] **A** — **Dès accord** sur ce questionnaire (Phase 0 **immédiate** dans le monorepo actuel).
- [ ] **B** — **Après** la fin du sprint « Mail / Photos / Pass » courant (stabilisation produit d’abord).
- [ ] **C** — **Phase 0 partielle** tout de suite : uniquement **`pkg/dbpin`** + doc ; versionnage npm/Dart/Go **après** le sprint.

---

## Synthèse rapide (à recopier dans un message)

Remplace les `?` par la lettre choisie (ex. `Q1=D, Q2=A, …`). Pour Q9, indique **quand** + **T1/T2/T3**.

```
Q1=?  Q2=?  Q3=?  Q4=?  Q5=?  Q6=?  Q7=?  Q8=?  Q9=?+T?  Q10=?
```

---

## Texte libre (court, **dans l’ordre** — optionnel)

Réponds en **5 lignes maximum**, une idée par ligne, dans cet ordre :

1. **Contrainte org** (GitHub org name, dépôt déjà existant, CI existante) :
2. **Hébergement prod** (VPS, cloud, bare metal, pays / RGPD si pertinent) :
3. **Priorité produit** sur 3 mois (ex. « Mail mobile avant polyrepo ») :
4. **Risque accepté** (ex. « OK pour submodules malgré la friction ») :
5. **Autre** (une phrase) :

```
1.
2.
3.
4.
5.
```

---

*Une fois les Q1–Q10 cochées (ou la synthèse envoyée), on enchaîne avec la **Phase 0** selon **[MULTI-REPO-LAYOUT.md](./MULTI-REPO-LAYOUT.md)** § 4.*
