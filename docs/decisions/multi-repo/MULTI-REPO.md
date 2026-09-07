# Multi-repo / monorepo (fiche décision unique)

## Sommaire

1. [Travail monorepo maintenant](#1-travail-monorepo-maintenant)
2. [Réponses](#2-réponses)
3. [Questionnaire](#3-questionnaire)

---

# 1. Travail monorepo maintenant

## Travailler en monorepo maintenant — déployer par brique — scinder plus tard

**Décision (2026-05-18)** : tant que **[MULTI-REPO.md](MULTI-REPO.md)** n’est pas entièrement exécuté en Phase 0, le dépôt **`Cloudity/` sur ton disque** reste **un seul monorepo Git**. Tu peux quand même **déployer chaque service séparément** (images Docker distinctes).

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

Remplis **[MULTI-REPO.md](MULTI-REPO.md)** quand tu tranches — jusqu’alors, considère **Q1=A + Q2=D + Q3=A** comme hypothèse de travail (déjà cochées dans le questionnaire).

---

*Dernière mise à jour : 2026-05-18.*


---

# 2. Réponses

## Réponses — questionnaire multi-repos

**Mode d’emploi** : remplis ce fichier puis pousse-le (ou colle-moi son contenu en chat). Dès que la **synthèse Q1–Q10** est renseignée, l’agent enchaîne sur la **Phase 0** décrite dans **[../../architecture/MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 4.

Voir le détail des options dans **[MULTI-REPO.md](MULTI-REPO.md)**.

---

## Synthèse rapide *(obligatoire)* — **bloc 1 : multi-repo (complet au 2026-05-12)**

```
Q1=A    polyrepo + meta-repo + git submodule
Q2=D    monorepo backend (cloudity-backend) — pas de scission service par service
Q3=A    un dépôt par app mobile Flutter
Q4=B    publication publique (npm.org + pub.dev + tags Go publics)
Q5=A    infrastructure/ reste dans le meta-repo
Q6=B    CI principalement meta-repo (jobs clonant les sous-dépôts)
Q7=C    stacks Portainer par domaine produit (Mail / Drive / Pass / Photos / Office / Identity / Infra)
Q8=*    architecture custom — voir docs/architecture/BACKUP.md
Q9=D+T3 extension Pass + desktop Linux : plus tard, stack à arbitrer
Q10=A   Phase 0 immédiate (pkg/dbpin + versionnage libs)
```

## Synthèse rapide — **bloc 2 : homelab / sécurité résidentielle (complet au 2026-05-12)**

Cadre détaillé : **[../../architecture/HOMELAB-SECURITE.md](../../architecture/HOMELAB-SECURITE.md)**.

```
Q11=A   scénario réseau MINIMAL : RPi simple serveur backup sur LAN + WireGuard
        (box FAI inchangée, pas de filtrage du trafic foyer pour démarrer)
Q12=A   hub USB 3.0 alimenté (~25 €) + disques USB tels quels
Q13=B   WireGuard + Headscale self-hosted (sans cloud tiers, scalabilité prévue)
Q14=A   nettoyage outillé : ncdu + rmlint + tar.zst -19 + LUKS + ext4
Q15=A   homelab avant prod : pas de mise en prod Cloudity tant que H1 (RPi backup
        opérationnelle) n'est pas livrée
```

## Synthèse rapide — **bloc 3 : crypto applicative & edge (complet au 2026-05-12)**

Cadre : **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)** ; edge : **[../../securite/REVERSE-PROXY.md](../../securite/REVERSE-PROXY.md)** ; WebAuthn : **[../../securite/WEBAUTHN-PLAN.md](../../securite/WEBAUTHN-PLAN.md)**.

```
Q16=A   JWT EdDSA : phase A+B maintenant (auth-service signe EdDSA ; gateway accepte
        EdDSA + RS256 legacy kid-aware) ; phase C retrait RS256 après ~30 jours
Q17=A   WebAuthn / passkeys : d’abord /4dm1n web (admins), extension users après validation
Q18=A   HTTP/3 (QUIC) : actif dès mise en prod (reverse-proxy)
Q19=A   TLS hybride PQ X25519MLKEM768 : actif dès mise en prod (reverse-proxy)
Q20=A   gosec : intégré à make test-security (warnings par défaut ; GOSEC_BLOCKING=1 pour fail)
```

## Synthèse rapide — **bloc 5 : durcissement admin / mail Zero Trust (complet au 2026-05-12)**

Cadre : **[../../securite/AUDIT-SECURITE.md](../../securite/AUDIT-SECURITE.md)** + **[../../securite/MTLS-INTERNE.md](../../securite/MTLS-INTERNE.md)**.

```
Q25=A   /admin UI : 404 explicite (vite + nginx + AdminApp), pas de redirection vers /4dm1n
Q26=A   /admin/* API : Origin strict + JWT EdDSA + role admin (CORS_ORIGINS allowlist)
Q27=A   POST /admin/performance/pipeline-run : double auth (JWT admin + X-Cloudity-Perf-Ingest)
        et obligatoire (admin-service renvoie 503 sans token configuré)
Q28=A   mail admin-only (/mail/{domains,mailboxes,aliases}*) : double contrôle :
        gateway (JWT + role admin) + mail-directory-service (X-Admin-Role required)
Q29=A   gateway sanitise X-User-ID, X-Tenant-ID, X-Admin-Role en entrée (stripInternalTrustHeaders)
Q30=A   helper make secrets : POSTGRES/REDIS/JWT/PERFORMANCE_INGEST_TOKEN générés en 256 bits
Q31=A   HTTPS dev local optionnel : make dev-https (mkcert + Vite)
```

## Synthèse rapide — **bloc 4 : déploiement VPS / Portainer / NPM (complet au 2026-05-12)**

Cadre : **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** (table des placeholders en § 0).

Contexte VPS observé au 2026-05-12 : un VPS public Portainer + une instance NPM partagée (`<NPM_HOST>`) hébergent déjà plusieurs applications. Cloudity doit s'y greffer sans casser l'existant. **Les valeurs concrètes (TLD, hostname NPM, owner registry, noms des autres stacks) restent hors Git** : Portainer Stack Variables ou `.env.deploy.local` git-ignored.

```
Q21=B   registry GHCR (ghcr.io/<REGISTRY_OWNER>/cloudity-<svc>:<TAG>) — auth via GITHUB_TOKEN
        intégrée à .github/workflows/docker-publish.yml (livré 349d1642)
Q22=A   réseau edge NPM : réutiliser le bridge external déjà branché à NPM
        (<EDGE_NETWORK>, valeur typique `web`) — zéro changement côté NPM ; les
        Compose Cloudity exposeront `cloudity-web`, `cloudity-api-gateway`,
        `cloudity-admin-service` sur ce réseau.
Q23=A   pattern `cloudity.<DOMAIN>` (shell SPA principal) + `api.cloudity.<DOMAIN>`
        + `admin.cloudity.<DOMAIN>` — cohérence avec les autres apps du VPS ;
        TLD dédié à reposer plus tard sans casse via redirections 301.
Q24=A   build & push : GitHub Actions matrice (push main/master, tag v*.*.*, workflow_dispatch)
        — livré (349d1642), images sur GHCR.
```

### Conséquences directes Q21–Q24

| Choix | Conséquence concrète |
|-------|----------------------|
| **Q21=B** | Aucun secret Docker Hub à provisionner ; `docker login ghcr.io -u <gh-user> -p <PAT:read:packages>` côté Portainer pour images privées (le repo Cloudity peut rester privé). Auth CI = `GITHUB_TOKEN` natif. |
| **Q22=A** | Les services exposés via NPM (front, gateway, admin) doivent être attachés au bridge `external: true` déjà branché à NPM (`<EDGE_NETWORK>`) dans leur `docker-compose.yml` Portainer. Les services internes (postgres, redis, services métier) restent sur des réseaux dédiés (`<INTERNAL_NETWORK>`, ex. `cloudity-data`) non joignables par NPM. |
| **Q23=A** | DNS à créer côté ton registrar : enregistrements pour **`cloudity`**, **`api.cloudity`**, **`admin.cloudity`** (CNAME ou A → IP VPS). NPM : un **Proxy Host** par FQDN vers `container_name:port` interne (cf. fiche § 1 bis et § 8). |
| **Q24=A** | Pour publier une release : `git tag v0.x.y && git push --tags` → GHA build matrice (10 Go + admin-service + frontend) en parallèle, push GHCR. Mise à jour Portainer = bump du `TAG=` dans la stack. |

### Conséquences directes des choix Q11–Q15

| Choix | Conséquence concrète |
|-------|----------------------|
| **Q11=A** | On retient le scénario A de **HOMELAB-SECURITE § 3.1**. Pas de bridge box FAI, pas de nftables routeur, pas de Pi-hole pour démarrer. Possibilité de monter en B/C plus tard sans casser ce qui aura été livré. |
| **Q12=A** | Achat à prévoir : **hub USB 3.0 alimenté 4 ports 5V/4A** (~25 €) — ex. Anker, Sabrent, Inateck. Disques USB connectés tels quels. |
| **Q13=B** | Headscale tournera comme **conteneur** sur la RPi (ou plus tard sur le VPS prod). Côté RPi : `headscale` + `wireguard` mais pilotés par Headscale plutôt que des `.conf` à la main. Permet d'ajouter/retirer des peers (PC fixe, smartphone, futur VPS, futurs peers familiaux) via une UI ou CLI sans toucher manuellement les configs WireGuard. |
| **Q14=A** | Procédure complète de **HOMELAB-SECURITE § 2** appliquée. **LUKS obligatoire** sur les 2 disques (chiffrement at-rest) — déchiffrage via clé sur SD card RPi (compromis ergonomie) ou via SSH `dropbear-initramfs`. |
| **Q15=A** | **Bloquant pour la mise en prod** : tant que la phase H1 (RPi + runner backup opérationnels + WireGuard + Headscale) n'est pas livrée, **on ne déploie pas Cloudity sur un VPS public**. Ça donne un ordre d'attaque clair pour les sprints qui mèneront à la prod. |

### Achats à valider (selon Q11=A + Q12=A)

- [ ] **Hub USB 3.0 alimenté 4 ports** (5V/4A, marque réputée) — ~25 €
- [ ] *(Optionnel)* **SSD M.2 USB 256 Go** pour remplacer la carte SD de la RPi (durée de vie sous écriture intensive) — ~40 €
- [ ] *(Optionnel)* **Boîtier RPi avec dissipation passive** (Argon ONE M.2, FLIRC) — ~30–50 €
- [ ] *(Optionnel)* **UPS 600 VA** pour protéger la RPi des coupures secteur — ~70 €

> Total minimum : ~25 €. Total recommandé (avec SSD et UPS) : ~135 €.

---

## Texte libre *(optionnel — 5 lignes max, dans l’ordre)*

```
1. (libre — à compléter si besoin)
2. (libre — à compléter si besoin)
3. (libre — à compléter si besoin)
4. (libre — à compléter si besoin)
5. (libre — à compléter si besoin)
```

---

## Notes / divergences éventuelles

### Q4 — publication publique des libs partagées

`@cloudity/shared`, `cloudity_shared` (Dart) et les modules Go (`internalsec`, futur `cloudity-pkg-dbpin`) seront publiés en **public** sur npm.org / pub.dev / GitHub. Conséquence : leur code sera visible publiquement avant que l'ensemble du dépôt ne soit ouvert. À garder en tête en y mettant **uniquement** des helpers neutres (pas de schéma DB sensible, pas de secrets, pas de logique métier propre à un tenant).

### Q7 — stacks Portainer par domaine

Découpage cible (à affiner) :

| Stack | Conteneurs |
|-------|-----------|
| `cloudity-infra` | postgres, redis, step-ca (option), reverse-proxy/NPM si pas externe |
| `cloudity-identity` | api-gateway, auth-service, admin-service |
| `cloudity-mail` | mail-directory-service |
| `cloudity-drive` | drive-service, photos-service (Drive est le backing store) |
| `cloudity-pass` | passwords-service |
| `cloudity-comm` | calendar-service, contacts-service, notes-service, tasks-service |
| `cloudity-web` | cloudity-web (SPA + bundle admin) |
| `cloudity-backup` | agent backup (cf. Q8 ci-dessous) |

Le `docker-compose.yml` actuel devient un **fragment** de référence pour le dev local, et chaque stack Portainer reprend la sous-section correspondante avec **réseaux Docker partagés** pour que la gateway puisse joindre tous les services applicatifs.

### Q8 — architecture backup distribué (réponse libre)

> Système dédié, facilement configurable pour n'importe quel Linux, lance des backups automatisés à distance vers une **machine de backup tierce** (raspberry, ordinateur fixe perso, NAS — **pas** sur le VPS de prod).
>
> Pilotage **double** :
> - depuis le **panel admin Cloudity** (`/4dm1n/backups`) qui passe par `admin-service` → API → agent distant ;
> - depuis un **petit panel local** sur la machine de backup (raspberry / PC) pour les opérations courantes (lancer, restaurer, voir l'historique).
>
> L'agent doit pouvoir s'**installer facilement** sur la machine cible (script d'installation + binaire ou conteneur), maintenir une **liaison sécurisée** (mTLS via step-ca, ou tunnel WireGuard / SSH) avec le VPS, et permettre :
> - **backup à tout moment** (manuel ou programmé) — Postgres dump + volumes Drive/Mail/Photos en Restic chiffré ;
> - **rollback** — sélection d'un point de restauration et application contrôlée ;
> - **monitoring** — dernière sauvegarde réussie, taille, durée, intégrité.

→ Architecture détaillée : **[../../architecture/BACKUP.md](../../architecture/BACKUP.md)** (créé en même temps que ce fichier).

### Q9 — Extension Pass + desktop Linux

Reportés **après** stabilisation Mail / Photos / Pass web (D). Choix Tauri vs Electron sera tranché par un **POC court** quand la décision deviendra actionnable (T3) — critères pré-vus : taille du binaire, intégration system tray, support des notifications natives Linux, signature de paquets `.deb`/`AppImage`.

### Q10 — Phase 0 immédiate

Démarrage **maintenant** de :

1. Extraction de `backend/pkg/dbpin` (module Go partagé) — casse la duplication des 7 copies actuelles.
2. Versionnage `internalsec` `v0.1.0` (lib Go).
3. Versionnage `@cloudity/shared` `v0.1.0` (npm — préparation, publication effective une fois l'org GitHub fixée).
4. Versionnage `cloudity_shared` `v0.1.0` (Dart — idem).
5. Esquisse de `docs/cloudity-api-contracts/` (OpenAPI par service public via la gateway).

---

*Si une décision change, mets à jour ce fichier puis indique-le dans `BACKLOG.md` (section « Architecture multi-repos GitHub »). Voir `docs/architecture/MULTI-REPO-LAYOUT.md` pour le détail technique de chaque phase.*


---

# 3. Questionnaire

## Questionnaire — décisions multi-repos Cloudity

**Rôle** : trancher les choix listés dans **[MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 10 avant d’engager la **Phase 0** (extraction `pkg/dbpin`, versionnage des libs, etc.).

**Mode d’emploi** : pour chaque question, **coche une seule option** (sauf si « Plusieurs » est explicitement proposé). Reporte ensuite tes choix dans **[MULTI-REPO.md](MULTI-REPO.md)** (synthèse `Q1=A, Q2=B, …` + texte libre court). La **Phase 0** démarre dès que les Q1–Q10 sont renseignées.

---

## Q1 — Stratégie de dépôts (court / moyen terme)

- [x] **A** — Polyrepo : **meta-repo** + sous-dépôts reliés par **`git submodule`** (un commit figé par sous-projet ; `git clone --recurse-submodules`).
- [ ] **B** — Polyrepo : meta-repo + sous-dépôts reliés par **`git subtree`** (copie importée ; pas de sous-module à l’usage quotidien).
- [ ] **C** — Polyrepo : meta-repo + outil **manifeste** (`meta`, `mu-repo`, `repo` Google, etc.) — pas de submodule Git natif.
- [ ] **D** — **Rester en monorepo** pour l’instant : `CODEOWNERS`, CI par chemins, branches par domaine ; scission **plus tard** quand les libs sont versionnées.

---

## Q2 — Granularité des dépôts **backend** (services Go + admin Python)

- [ ] **A** — **Un dépôt par microservice** (~11 dépôts : gateway, auth, passwords, mail-directory, drive, photos, calendar, contacts, notes, tasks, admin-service).
- [ ] **B** — **Trois regroupements** : (1) `auth` + `passwords` ; (2) `mail-directory` + `contacts` + `calendar` + `notes` + `tasks` ; (3) `drive` + `photos` ; **gateway** et **admin-service** restent séparés (total ~6 dépôts métier + gateway + admin).
- [ ] **C** — **Deux regroupements** : « **comm** » (mail + contacts + calendar + notes + tasks) et « **fichiers** » (drive + photos + pass côté API si un jour fusionné — **non recommandé** tant que Pass est un service distinct) — à n’utiliser que si tu acceptes des PR plus larges.
- [x] **D** — **Monorepo backend** (`cloudity-backend`) avec dossiers par service ; scission uniquement **front** / **mobile** / **extensions**.

---

## Q3 — Granularité des dépôts **mobile** (Flutter)

- [x] **A** — **Un dépôt par application** (`cloudity-mobile-mail`, `…-drive`, `…-photos`, `…-pass`, `…-admin`, etc.).
- [ ] **B** — **Un seul dépôt** `cloudity-mobile` avec `apps/mail`, `apps/drive`, `apps/photos`, … et package partagé en workspace interne.
- [ ] **C** — **Hybride** : apps « matures » (mail, drive, photos) en repos séparés ; apps naissantes (pass, futur hub) dans un repo `cloudity-mobile-incubator` jusqu’à stabilisation.

---

## Q4 — **Registry** pour les artefacts partagés (npm, Dart, Go)

- [ ] **A** — **GitHub Packages** (privé) pour `@cloudity/*`, éventuellement images GHCR ; Go : modules privés sur `github.com/<org>/…` avec tags `v*`.
- [x] **B** — **Public** dès que possible : **npm** + **pub.dev** (pour `cloudity_shared`) + tags Go publics sur GitHub.
- [ ] **C** — **Hybride** : GitHub Packages pour le privé **aujourd’hui** ; bascule npm/pub.dev **quand** le code sera ouvert ou partiellement ouvert.

---

## Q5 — Emplacement de **`infrastructure/`** (Postgres, migrations, reverse-proxy, step-ca)

- [x] **A** — **Tout reste dans le meta-repo** Cloudity (recommandé par défaut : une seule vérité pour les migrations SQL).
- [ ] **B** — **Dépôt séparé** `cloudity-infra` (accès restreint, stacks Portainer, secrets hors code applicatif) ; le meta-repo ne garde que `docker-compose` dev minimal.
- [ ] **C** — **Hybride** : migrations + schéma dans le meta-repo ; **templates** NPM / Portainer / prod dans `cloudity-infra`.

---

## Q6 — **CI** (GitHub Actions)

- [ ] **A** — **Workflow par dépôt** + un workflow **d’orchestration** dans le meta-repo (déclenche les autres ou agrège les statuts).
- [x] **B** — **Principalement le meta-repo** : un job clone les sous-dépôts (ou checkout submodules) et lance `make test` global.
- [ ] **C** — **Hybride** : CI unitaire **dans chaque dépôt** ; E2E / stack complète **uniquement** dans le meta-repo (nightly + avant release).

---

## Q7 — **Portainer** + **nginx-proxy-manager** (prod)

- [ ] **A** — **Une stack Docker unique** (tous les services dans un seul `docker-compose` Portainer) — simple, redéploiement global.
- [ ] **B** — **Plusieurs stacks** (ex. `stack-core` Postgres/Redis, `stack-edge` NPM, `stack-api` gateway+services, `stack-web` front) — redémarrages ciblés.
- [x] **C** — **Stacks par domaine produit** (Mail, Drive, Pass, Photos, Office, Identity, Infra) — maximum d’isolation, plus de coordination.

---

## Q8 — **Backups** automatisés + pilotage UI

- [ ] **A** — **Conteneur dédié** `cloudity-backup` (**Restic** + snapshots PG) ; API **`admin-service`** pour « lancer maintenant », plan, restauration contrôlée (comme décrit dans MULTI-REPO-LAYOUT § 8.3).
- [ ] **B** — **Restic uniquement** en cron sur l’hôte / stack infra, **sans** panneau Cloudity au début (UI plus tard).
- [ ] **C** — **Autre outil** (ex. BorgBackup, Kopia) — préciser en **texte libre** § remarques.
- [x] **D — réponse libre** : **agent backup distribué offsite** (raspberry / PC perso, pas sur le VPS), pilotable depuis le panel admin (`/4dm1n/backups`) **et** depuis un panel local. Architecture détaillée : **[../../architecture/BACKUP.md](../../architecture/BACKUP.md)**.

---

## Q9 — **Extension navigateur Pass** + **application Linux** (desktop)

**Quand démarrer le chantier** (indépendamment de la scission Git) :

- [ ] **A** — **Avant** la scission multi-repo (le code vit encore dans le monorepo, dossiers `extensions/` et `desktop/`).
- [ ] **B** — **Après** la Phase 0 (libs versionnées) mais **avant** la scission complète des services.
- [ ] **C** — **Après** la scission des repos **front** / **outillage** seulement.
- [x] **D** — **Plus tard** (après stabilisation Mail / Photos / Pass web).

**Stack desktop Linux** (une option) :

- [ ] **T1** — **Tauri** (Rust + WebView ; binaire léger).
- [ ] **T2** — **Electron** (écosystème large, empreinte plus lourde).
- [x] **T3** — **Pas encore décidé** / étude de faisabilité (GTK/Qt natif hors scope court terme).

---

## Q10 — **Calendrier** de la Phase 0 (extraction `pkg/dbpin` + versionnage `internalsec`, `@cloudity/shared`, `cloudity_shared`)

- [x] **A** — **Dès accord** sur ce questionnaire (Phase 0 **immédiate** dans le monorepo actuel).
- [ ] **B** — **Après** la fin du sprint « Mail / Photos / Pass » courant (stabilisation produit d’abord).
- [ ] **C** — **Phase 0 partielle** tout de suite : uniquement **`pkg/dbpin`** + doc ; versionnage npm/Dart/Go **après** le sprint.

---

## Bloc 2 — Homelab & sécurité résidentielle (Q11 → Q15)

> Contexte : la Raspberry Pi à la maison + 2 disques USB (1 To + 500 Go) servira de **machine de backup offsite Cloudity** + (selon choix) **routeur / pare-feu / VPN** filtrant le trafic du foyer.  
> Cadre détaillé : **[../../architecture/HOMELAB-SECURITE.md](../../architecture/HOMELAB-SECURITE.md)**.  
> Statut : **avant mise en production** Cloudity. Pas d'urgence, mais commence à délibérer **maintenant** (matériel = délai d'achat, scénarios B/C = configuration).

---

## Q11 — **Scénario réseau homelab** (cf. HOMELAB-SECURITE § 3)

- [x] **A — Minimal** : la RPi reste un simple serveur backup sur le LAN, la box FAI ne change pas. WireGuard sur la RPi pour accès distant. Pas de filtrage du trafic du foyer. *(prêt en 1 weekend, ~50 € matériel)*
- [ ] **B — Médian** : la RPi devient routeur/pare-feu (nftables + Pi-hole/AdGuard + WireGuard) entre la box FAI et le LAN. Filtrage granulaire (bloque YouTube ads/IoT, whitelist Netflix + IP du PC fixe). *(2-3 weekends, ~150 € matériel + UPS)*
- [ ] **C — Cible** : mini-PC dédié routeur (OPNsense ou nftables), switch managé avec VLAN trust/DMZ/IoT, RPi backup dédiée. Architecture pro auditable. *(1-2 mois, ~400 € matériel)*
- [ ] **D — Différer la décision** : on garde le runner backup en LAN simple (équivalent A) tant que Cloudity n'est pas en prod ; on retranche pour B/C plus tard.

---

## Q12 — **Branchement des 2 disques USB sur la RPi**

- [x] **A** — **Hub USB 3.0 alimenté** (~25 €) + disques USB tels quels. Simple, robuste si hub de qualité.
- [ ] **B** — Sortir les disques de leurs boîtiers actuels et les **monter dans un boîtier 2-baies USB-C alimenté** (ex. ICY BOX, ~70 €). Plus propre, alim dédiée, ventilation.
- [ ] **C** — Migrer plus tard vers un **NAS DIY 4 baies** (boîtier + carte mère ITX, hors RPi) pour mode RAID. *(réservé scénario C ou plus tard)*

---

## Q13 — **VPN ultra chiffré** (cf. HOMELAB-SECURITE § 4)

- [ ] **A** — **WireGuard pur** configuré à la main (clés Curve25519 + PSK + ChaCha20-Poly1305) — recommandé pour ≤ 5 peers.
- [x] **B** — **WireGuard + Headscale self-hosted** (clone open-source de Tailscale, sans dépendance cloud tiers) — utile si plus de 5–10 peers ou ajout fréquent.
- [ ] **C** — **OpenVPN** (TLS, ChaCha20). Plus tolérant aux NAT compliqués mais plus lourd / plus de surface d'attaque.
- [ ] **D — À décider plus tard** (par défaut WireGuard).

---

## Q14 — **Procédure de nettoyage des 2 disques** (cf. HOMELAB-SECURITE § 2)

- [x] **A** — **Workflow complet outillé** : `ncdu` pour le tri manuel + `rmlint` pour les doublons + compression `tar.zst -19` des dossiers à archiver + LUKS au format final. *(1-2 soirées par disque)*
- [ ] **B** — **Workflow réduit** : tri manuel uniquement, pas de compression (les disques ont assez d'espace après tri), formatage simple ext4 (sans LUKS).
- [ ] **C** — **Garder un disque tel quel pour le moment** (le 500 Go) en archive froide, **dédier seulement le 1 To** au backup Cloudity.
- [ ] **D — Différer cette opération** : on traite ça quand on installe la Phase H1 (RPi + runner).

---

## Q15 — **Calendrier homelab vs Cloudity prod**

- [x] **A** — **Homelab d'abord** : pas de mise en prod Cloudity tant que la RPi backup n'est pas opérationnelle (au moins phase H1 de HOMELAB-SECURITE).
- [ ] **B** — **Parallèle** : on déploie Cloudity sur le VPS de prod et on met en place la RPi homelab en parallèle ; les premières semaines, backups manuels via `pg_dump` SCP.
- [ ] **C** — **Cloudity prod d'abord** (sur VPS), homelab après stabilisation. Risque accepté : 4-8 semaines sans backup offsite.

---

## Bloc 3 — Crypto applicative & edge (Q16 → Q20)

> Contexte : alignement sur **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)** (whitelist / blacklist, JWT, TLS, Argon2id, CI).  
> Statut : **décisions acquises au 2026-05-12** — voir **[MULTI-REPO.md](MULTI-REPO.md)** bloc 3.

---

## Q16 — **Migration JWT** RS256 → **EdDSA (Ed25519)**

- [x] **A** — **Maintenant** : phase A (double publication des clés / JWKS ou fichiers PEM partagés) + phase B (nouveaux tokens en EdDSA) ; phase C (retrait RS256) après ~30 jours d’expiration des refresh tokens.
- [ ] **B** — **Après** stabilisation Mail/Photos/Pass : sprint dédié plus tard (RS256 reste en place).
- [ ] **C** — **Phase A seulement** maintenant (préparer les clés / JWKS) sans activer EdDSA pour les nouveaux tokens.

---

## Q17 — **WebAuthn / passkeys** (FIDO2)

- [x] **A** — Activer **d’abord pour `/4dm1n` web** (admins en priorité), puis étendre aux utilisateurs après validation. Lib Go cible : `go-webauthn/webauthn`.
- [ ] **B** — Activer pour `/4dm1n` **et** pour les utilisateurs réguliers dès le début (TOTP en fallback).
- [ ] **C** — Différer après la mise en prod sur VPS.
- [ ] **D** — Différer indéfiniment : TOTP suffit.

---

## Q18 — **HTTP/3 (QUIC)** côté reverse-proxy en prod

- [x] **A** — Activer **dès la mise en prod** (Caddy 2.6+ ou nginx 1.25+ avec QUIC ; ouvrir **UDP/443**).
- [ ] **B** — N’activer qu’après 1–2 mois de prod stable en HTTP/2.
- [ ] **C** — Pas de priorité : HTTP/2 suffit.

---

## Q19 — **Hybride post-quantique TLS** (`X25519MLKEM768`) côté reverse-proxy public

- [x] **A** — Activer **dès la mise en prod** (Caddy 2.8+ ou nginx + OpenSSL 3.5+).
- [ ] **B** — Activer après 6–12 mois (maturité des implémentations).
- [ ] **C** — Mode opportuniste (le client choisit hybride ou classique).

---

## Q20 — **`gosec`** (analyse statique Go) en CI

- [x] **A** — Ajouter à **`make test-security`** ; par défaut **warnings** ; `GOSEC_BLOCKING=1` pour fail le build sur findings.
- [ ] **B** — Informatif uniquement (pas de fail) le temps de nettoyer les faux positifs.
- [ ] **C** — Plus tard ; `govulncheck` suffit pour l’instant.

---

## Bloc 4 — Déploiement VPS / Portainer / NPM (Q21 → Q24)

> Contexte : un VPS public héberge déjà plusieurs applications via une instance partagée de **Nginx Proxy Manager** (NPM, hostname `<NPM_HOST>`). Plusieurs réseaux Docker `external: true` y sont attachés. Cloudity doit s'y greffer **sans casser** ces stacks existantes. Les valeurs concrètes (TLD, hostname NPM, owner registry, noms des autres apps) restent **hors Git** : Portainer Stack Variables ou `.env.deploy.local` git-ignored.
> Cadre détaillé : **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** (table des placeholders en § 0).

---

## Q21 — **Registry** des images Cloudity *(décidé 2026-05-12 — livré au commit `349d1642`)*

- [ ] **A** — **Docker Hub** sous `<your-dockerhub-user>/cloudity-<svc>:<tag>`. Tag immuable `:0.x.y` + alias `:latest`. Nécessite secrets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` côté GHA.
- [x] **B** — **GHCR** `ghcr.io/<REGISTRY_OWNER>/cloudity-<svc>:<tag>` — auth via `GITHUB_TOKEN` (zéro secret à provisionner), tags `branch` / `semver` / `sha-<short>` / `latest`. Cf. `.github/workflows/docker-publish.yml`.
- [ ] **C** — **Hybride** : tags privés (admin-service, internalsec) sur GHCR, tags publics (frontend, libs) sur Docker Hub.

---

## Q22 — **Réseau Docker edge** que NPM doit atteindre *(décidé 2026-05-12 — défaut)*

- [x] **A** — **Réutiliser le bridge `external: true` déjà branché à NPM** (variable `<EDGE_NETWORK>` ; valeur typique `web`). Zéro changement côté NPM. *Recommandation par défaut.*
- [ ] **B** — **Réutiliser un autre bridge external partagé** déjà attaché à NPM (cohérence si plusieurs stacks ont migré dessus).
- [ ] **C** — **Créer un `cloudity-edge` dédié** (isolation totale). Il faudra brancher le conteneur NPM à ce nouveau réseau via Portainer une fois.

---

## Q23 — **Pattern de domaine** pour Cloudity en production *(décidé 2026-05-12)*

- [x] **A** — **`cloudity.<DOMAIN>`** (origine principale du shell SPA, équivalent dev `localhost:6001` + `/app/…`) + **`api.cloudity.<DOMAIN>`** (gateway) + **`admin.cloudity.<DOMAIN>`** (même front ou host dédié admin). Possibilité d’ajouter plus tard `mail.cloudity.<DOMAIN>`, `drive.cloudity.<DOMAIN>` comme **option** (DNS + NPM + routage, cf. **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** § 1 ter / § 8 bis). Le **TLD réel** reste hors Git (Portainer / `.env.deploy.local`).
- [ ] **B** — **TLD dédié** (`<TLD_CLOUDITY>` distinct du TLD principal). Mieux pour l'image produit, demande un nouveau domaine + DNS.
- [ ] **C** — **Hybride** : `<DOMAIN>` au début (test / soft launch) ; bascule TLD dédié plus tard sans casser les URLs (redirections 301).

---

## Q24 — **Build & push images** : flux d'automatisation *(décidé 2026-05-12 — livré au commit `349d1642`)*

- [x] **A** — **GitHub Actions** sur tag `v*.*.*` : matrice qui builde et pousse les 12 images en parallèle (cf. fiche § 9). Déclenchable aussi manuellement (`workflow_dispatch`).
- [ ] **B** — **Build local + `docker push`** manuel le jour du déploiement (plus simple à démarrer ; pas de secrets GitHub à configurer).
- [ ] **C** — **Hybride** : build local pour les premiers déploiements, GHA branchée plus tard quand le rythme de release augmente.

---

## Bloc 5 — durcissement admin / mail Zero Trust *(Q25–Q31, livré au 2026-05-12)*

> Décisions issues de l'audit **[../../securite/AUDIT-SECURITE.md](../../securite/AUDIT-SECURITE.md)**. Marquées **A** dans **MULTI-REPO.md** ; les laisser cochées comme rappel d'engagement.

### Q25 — UI `/admin` (anti-énumération)

- [x] **A** — **404 explicite** côté Vite dev + nginx prod + AdminApp router ; aucune redirection vers `/4dm1n`.
- [ ] **B** — Redirection 301 → `/4dm1n` (rejeté : favorise l'énumération).

### Q26 — API `/admin/*` (gateway)

- [x] **A** — `Origin` strict + JWT EdDSA + rôle admin ; `CORS_ALLOW_LAN=false` en prod.
- [ ] **B** — Bearer seul (rejeté : trop laxiste face au CSRF / CORS).

### Q27 — `POST /admin/performance/pipeline-run` (CI ingestion)

- [x] **A** — **Double facteur** : JWT admin **+** `X-Cloudity-Perf-Ingest` (`PERFORMANCE_INGEST_TOKEN`) — admin-service renvoie **503** si non configuré.
- [ ] **B** — JWT admin seul (rejeté : difficile à utiliser en CI sans compte humain).

### Q28 — Mail admin-only (`/mail/{domains,mailboxes,aliases}*`)

- [x] **A** — **Double contrôle** : gateway (JWT + rôle admin) **et** mail-directory-service (`X-Admin-Role: admin` requis).
- [ ] **B** — Gateway seule (rejeté : un pivot réseau Docker contournerait tout).

### Q29 — Sanitisation des en-têtes de confiance (gateway)

- [x] **A** — `stripInternalTrustHeaders` retire `X-User-ID`, `X-Tenant-ID`, `X-Admin-Role` à l'entrée de chaque requête, avant ré-injection après vérif JWT.
- [ ] **B** — Pas de strip (rejeté : un client peut alors falsifier ces valeurs).

### Q30 — Génération des secrets

- [x] **A** — `make secrets` (256 bits) pour POSTGRES, REDIS, JWT_SECRET, **`PERFORMANCE_INGEST_TOKEN`**.
- [ ] **B** — Saisie manuelle (rejeté : entropie insuffisante).

### Q31 — HTTPS dev local

- [x] **A** — Optionnel via `make dev-https` (mkcert + Vite). Backend reste en HTTP local ; TLS prod géré au reverse-proxy.
- [ ] **B** — TLS de bout en bout en dev (rejeté : friction trop forte).

---

> **Tes réponses vont dans** **[MULTI-REPO.md](MULTI-REPO.md)** — synthèse `Q1=… Q31=…` + texte libre court (5 lignes).
> Une fois ce fichier rempli, on enchaîne :
> • **Phase 0 multi-repo** (cf. **[../../architecture/MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 4) — étapes 2/3 dbpin + versionnage libs + esquisse contrats API.
> • **Phase H0 homelab** (cf. **[../../architecture/HOMELAB-SECURITE.md](../../architecture/HOMELAB-SECURITE.md)** § 8) — selon Q11–Q15.
> • **Crypto / edge** — selon Q16–Q20 et **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)**.
> • **Stacks Portainer + images Docker** — selon Q21–Q24 et **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

