# Questionnaire — décisions multi-repos Cloudity

**Rôle** : trancher les choix listés dans **[MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 10 avant d’engager la **Phase 0** (extraction `pkg/dbpin`, versionnage des libs, etc.).

**Mode d’emploi** : pour chaque question, **coche une seule option** (sauf si « Plusieurs » est explicitement proposé). Reporte ensuite tes choix dans **[REPONSES.md](REPONSES.md)** (synthèse `Q1=A, Q2=B, …` + texte libre court). La **Phase 0** démarre dès que les Q1–Q10 sont renseignées.

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
- [x] **D — réponse libre** : **agent backup distribué offsite** (raspberry / PC perso, pas sur le VPS), pilotable depuis le panel admin (`/4dm1n/backups`) **et** depuis un panel local. Architecture détaillée : **[../../architecture/BACKUP-OFFSITE.md](../../architecture/BACKUP-OFFSITE.md)**.

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

# Bloc 2 — Homelab & sécurité résidentielle (Q11 → Q15)

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

# Bloc 3 — Crypto applicative & edge (Q16 → Q20)

> Contexte : alignement sur **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)** (whitelist / blacklist, JWT, TLS, Argon2id, CI).  
> Statut : **décisions acquises au 2026-05-12** — voir **[REPONSES.md](REPONSES.md)** bloc 3.

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

# Bloc 4 — Déploiement VPS / Portainer / NPM (Q21 → Q24)

> Contexte : VPS Contabo avec **Portainer** + **Nginx Proxy Manager** (`nginx.delhomme.ovh`) déjà en place, stacks existantes : `cooking-recipes` (`paveldelhomme/cookingrecipes-*:latest` sur Docker Hub), `cyna-production`, `n8n-stack`, `nextcloud-stack`. Réseaux Docker partagés : `web` (utilisé par cooking-recipes) et `shared-network-copy` (cyna, n8n).
> Cadre détaillé : **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

---

## Q21 — **Registry** des images Cloudity

- [ ] **A** — **Docker Hub** sous `paveldelhomme/cloudity-<svc>:<tag>` (cohérent avec `cookingrecipes-*`, `cyna_*` déjà en place). Tag immuable `:0.x.y` + alias `:latest`.
- [ ] **B** — **GHCR** `ghcr.io/paveldelhomme/cloudity-<svc>:<tag>` (intégration GitHub plus directe, illimité pour repos publics).
- [ ] **C** — **Hybride** : tags privés (admin-service, internalsec) sur GHCR, tags publics (frontend, libs) sur Docker Hub.

---

## Q22 — **Réseau Docker edge** que NPM doit atteindre

- [ ] **A** — **Réutiliser `web`** (déjà branché à NPM, déjà utilisé par `cookingrecipes`). Zéro changement côté NPM. *Recommandation par défaut.*
- [ ] **B** — **Réutiliser `shared-network-copy`** (cohérent avec `cyna_frontend_prod`, `n8n`).
- [ ] **C** — **Créer un `cloudity-edge` dédié** (isolation totale). Il faudra brancher le conteneur NPM à ce nouveau réseau via Portainer une fois.

---

## Q23 — **Pattern de domaine** pour Cloudity en production

- [ ] **A** — **`cloudity.delhomme.ovh`** + sous-domaines `api.`, `admin.` (cohérent avec `cookingrecipes.delhomme.ovh` + `api.cookingrecipes.delhomme.ovh`). Possibilité d'ajouter plus tard `mail.cloudity.delhomme.ovh`, `drive.cloudity.delhomme.ovh` comme alias UX.
- [ ] **B** — **TLD dédié** (`cloudity.<ton-tld-cloudity>`) acheté pour le projet, séparé de `delhomme.ovh`. Mieux pour l'image produit, demande un nouveau domaine + DNS.
- [ ] **C** — **Hybride** : `delhomme.ovh` au début (test / soft launch) ; bascule TLD dédié plus tard sans casser les URLs (redirections 301).

---

## Q24 — **Build & push images** : flux d'automatisation

- [ ] **A** — **GitHub Actions** sur tag `v*.*.*` : matrice qui builde et pousse les 12 images en parallèle (cf. fiche § 9). Déclenchable aussi manuellement (`workflow_dispatch`).
- [ ] **B** — **Build local + `docker push`** manuel le jour du déploiement (plus simple à démarrer ; pas de secrets GitHub à configurer).
- [ ] **C** — **Hybride** : build local pour les premiers déploiements, GHA branchée plus tard quand le rythme de release augmente.

---

## Bloc 5 — durcissement admin / mail Zero Trust *(Q25–Q31, livré au 2026-05-12)*

> Décisions issues de l'audit **[../../securite/AUDIT-SECURITE.md](../../securite/AUDIT-SECURITE.md)**. Marquées **A** dans **REPONSES.md** ; les laisser cochées comme rappel d'engagement.

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

> **Tes réponses vont dans** **[REPONSES.md](REPONSES.md)** — synthèse `Q1=… Q31=…` + texte libre court (5 lignes).
> Une fois ce fichier rempli, on enchaîne :
> • **Phase 0 multi-repo** (cf. **[../../architecture/MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 4) — étapes 2/3 dbpin + versionnage libs + esquisse contrats API.
> • **Phase H0 homelab** (cf. **[../../architecture/HOMELAB-SECURITE.md](../../architecture/HOMELAB-SECURITE.md)** § 8) — selon Q11–Q15.
> • **Crypto / edge** — selon Q16–Q20 et **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)**.
> • **Stacks Portainer + images Docker** — selon Q21–Q24 et **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.
