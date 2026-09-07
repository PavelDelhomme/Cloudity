# Performances, diagnostic et allègement — Cloudity

**Rôle** : inventaire **factuel** de la stack actuelle (langages, conteneurs, services), **objectifs** (léger, rapide, observable) et **pistes** (y compris alternatives « gros gains ») **sans sacrifier la sécurité** ni une **UX** digne d’une suite grand public. Ce document est une **feuille de route technique** : rien n’y est entièrement « livré » côté observabilité produit tant que le backlog associé ([BACKLOG.md](../../BACKLOG.md), **TR-06** dans [ROADMAP.md](../produit/ROADMAP.md)) n’est pas coché.

> **Outils CLI dev** : pour la **surveillance temps réel** des ressources et le
> **rituel checkpoint perf** (snapshot avant/après chaque feature, diff,
> budgets), voir le document opérationnel dédié
> **[#surveillance-cli](#surveillance-cli-ressources)** — il décrit les
> 4 scripts `scripts/dev/perf-*.sh` et les cibles `make perf-watch /
> perf-snapshot / perf-diff / perf-budgets`.

**Dernière mise à jour** : 2026-05-20 — dashboard admin clarifié : quand Docker n’est pas visible dans le runtime admin-service, la carte performance affiche explicitement le mode **cgroup seul** au lieu de laisser croire que la liste des conteneurs est cassée.

**Dernière mise à jour** : 2026-05-15 — liens **[ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)** § tableau doc § 7 ; corrections factuelles § 3.1 (**admin-service** = FastAPI ; front = **cloudity-web**) ; note bas de page § 8 : Grafana/Prometheus **si** ajoutés au compose (**TR-06**).

**Dernière mise à jour** : 2026-05-06.

## Mise à jour 2026-05-06 — base admin runtime

- **Livré (base opérationnelle)** : nouvel endpoint admin **`GET /admin/performance/overview`** (admin-service) avec snapshot runtime :
  - **Host/cgroup** : load avg, CPU usage/user/system (`cpu.stat`), mémoire (`memory.current` / `memory.peak`), IO lecture/écriture (`io.stat`).
  - **Conteneurs** : tentative de snapshot **`docker stats --no-stream`** quand le binaire Docker est disponible dans le runtime ; fallback documenté sinon.
  - **Backoffice** : affichage des métriques runtime dans le dashboard admin (rafraîchissement périodique).
- **Limite actuelle** : la vue conteneurs dépend de la disponibilité de Docker côté runtime admin-service. Sans Docker, on garde les métriques cgroup du service courant.
- **Prochaine phase (obligatoire pour “tous les cas imaginables”)** :
  1. instrumentation standardisée par service (latence route, CPU/mémoire process, IO, erreurs) ;
  2. agrégation centralisée (Prometheus/Loki/OTel collector) ;
  3. historisation + graphiques dans l’admin (pas seulement snapshot) ;
  4. budgets automatiques sur `make test`, E2E et mobile (gates de perf).

---

## 1. Fichiers de trace présents (ou typiques) dans le dépôt

### `profiling-data.*.json` (ex. `profiling-data.27-02-2026.01-40-21.json`)

- **Nature** : export **React DevTools → Profiler** (format avec `version`, `dataForRoots`, `fiberActualDurations`, etc.).
- **Utilité** : analyser **quels composants** re-render, combien de temps passent les effets / le commit React, repérer des listes lourdes ou des contextes trop larges.
- **Bonnes pratiques** : ne **pas** versionner de gros exports en continu (bruit, PII indirecte selon l’écran profilé). Préférer les garder **en local** ou dans un dossier d’artefacts CI ignoré par Git — voir **§ 8**.

### `Trace-*T*.json` / `Trace-*T*.json.tgz` (ex. `Trace-20260227T012249.json.tgz`)

- **Nature** : en général une **trace Performance** exportée depuis **Chrome / Chromium / Edge** (DevTools → onglet **Performance**), parfois **compressée** (`.tgz` = archive tar gzip).
- **Utilité** : mesurer le **thread principal** (JS, layout, paint), le réseau, les tâches longues ; utile pour LCP, TBT, interactions bloquées.
- **Note sur le nom** : un préfixe de date du type `20260227` ressemble à une **erreur de saisie** pour **2026-02-27** ; vérifier la source (export manuel, script, outil tiers).

**Ce n’est pas** du code applicatif Cloudity : ce sont des **données de mesure** à traiter comme des artefacts de debug.

---

## 2. Principes (périmètre « gros mais sain »)

| Principe | Détail |
|----------|--------|
| **Mesurer avant d’optimiser** | Budgets par surface (web admin, pages lourdes Mail/Drive/Photos, gateway, IMAP). |
| **Sécurité d’abord** | Pas de « perf » qui désactive TLS, JWT, validation ou audit ; les gains passent par **moins de travail inutile**, **meilleur cache**, **meilleures requêtes**, **pagination**. |
| **UX** | Latence perçue (squelettes, pagination, requêtes parallèles contrôlées) ; éviter les spinners bloquants sans feedback. |
| **Scope réaliste** | Suite multi-services : l’objectif est **soutenable** (pas « tout en < 10 ms »), mais **sans dérive** (N+1, polling agressif partout, bundles énormes). |

---

## 3. Architecture actuelle (aperçu)

### 3.1 Conteneurs & données (docker-compose principal)

| Composant | Technologie | Rôle perf / remarque |
|-----------|-------------|----------------------|
| **postgres** | PostgreSQL 15 Alpine | Index, requêtes, `EXPLAIN`, pooling côté apps. |
| **redis** | Redis 7 Alpine | Sessions / cache ; latence faible si utilisé avec discipline (TTL, pas de grosses valeurs). |
| **db-migrate** | image Postgres + scripts | Hors runtime utilisateur. |
| **auth-service** | Go (Gin), `GIN_MODE=release` en image | JWT, Redis ; point critique auth sur chaque requête gateway. |
| **api-gateway** | Go | Proxy, validation JWT, fan-out vers services ; **chemin critique** global. |
| **admin-service** | Python (**FastAPI**) | Admin ; volume moindre que le dashboard utilisateur mais à surveiller (cold start, GIL si CPU-bound). |
| **passwords-service** | *(stack du service)* | Pass ; sensibilité sécurité > micro-optimisations naïves. |
| **mail-directory-service** | Go | IMAP + SQL ; sync et listes : **candidates** profiling SQL + goroutines. |
| **calendar-service**, **notes-service**, **tasks-service** | Go | CRUD + Postgres. |
| **drive-service** | Go | Fichiers, métadonnées ; IO et requêtes liste. |
| **photos-service** | Go | Timeline, médias. |
| **contacts-service** | Go | Liste / fiches. |
| **cloudity-web** | React + Vite + TypeScript (Vitest) | **Bundle** client, **React Query**, listes virtuelles à étudier où nécessaire. |
| **adminer**, **redis-commander** | Outils | Dev uniquement. |

Fichiers de référence : [docker-compose.yml](../../docker-compose.yml), variantes `docker-compose.*.yml`.

### 3.2 Clients mobiles

| Composant | Technologie | Piste perf |
|-----------|-------------|------------|
| **mobile/** (Flutter) | Dart, moteur Flutter | `flutter run --profile`, DevTools CPU/Memory ; images cache, isolates pour parsing lourd — [MOBILE-PLATEFORME.md](../produit/MOBILE-PLATEFORME.md). |

### 3.3 Front web (`cloudity-web`)

- **Build** : Vite (ESM, tree-shaking) ; dépendance à [FRONTENDS.md](../architecture/FRONTENDS.md) pour découpage multi-apps.
- **Données** : TanStack Query (cache, `staleTime`, invalidations ciblées plutôt que « tout invalider »).
- **Risques** : pages « monolitiques » (ex. Mail) → Profiler React + code splitting ciblé si les métriques le demandent.

---

## 4. Cibles de diagnostic (à mettre en œuvre — backlog)

| Domaine | Indicateurs / outils | Livrable cible |
|---------|------------------------|----------------|
| **Gateway** | Latence p50/p95 par route, erreurs 5xx, timeouts upstream | **Baseline** : chaque requête journalisée avec **durée totale** et **code HTTP** (`[gateway] METHOD path -> status duration`) — agrégation p50/p95 (Prometheus / Loki) à venir (**TR-06**). |
| **Services Go** | `pprof` (CPU, heap), traces OpenTelemetry | Profil sous charge contrôlée ; pas en prod sans garde-fous. |
| **Postgres** | Requêtes lentes, `pg_stat_statements` | Index manquants, pagination serveur. |
| **Redis** | Mémoire, évictions | Politique TTL claire. |
| **Dashboard** | Lighthouse / Web Vitals, Profiler React, trace Chrome | Budgets LCP/FID/CLS par route clé. |
| **Mobile** | Flutter DevTools, taille APK/IPA | Réduire assets, lazy loading des écrans lourds. |

---

## 5. Leviers « gros gains » (sans casser sécurité / UX)

| Levier | Idée | Précaution |
|--------|------|------------|
| **Pagination & filtres serveur** | Moins de données par réponse | Déjà partiellement en place (Mail, Drive) ; généraliser. |
| **Cache HTTP / CDN** | Assets statiques, `Cache-Control` pour builds Vite | Ne pas mettre en cache des réponses **personnalisées** ou JWT. |
| **Compression** | `gzip`/`brotli` au reverse proxy | TLS terminé correctement ([SECURITE.md](../securite/SECURITE.md)). |
| **DB** | Index composés, éviter N+1, lectures read-only répliquées (futur) | Cohérence transactions. |
| **IMAP / Mail** | Sync incrémentale, moins de `SELECT` redondants, fenêtres UID | Déjà documenté partiellement dans [SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md). |
| **Gateway** | Connection pooling vers upstreams, timeouts explicites | Éviter les cascades de lenteur. |
| **Front** | `React.lazy`, réduire re-renders (memo, contextes découpés) | Mesurer avec Profiler avant « memo partout ». |
| **Images / Photos** | Tailles multiples, WebP/AVIF, lazy load | Chiffrement / E2EE selon produit ([SECURITE.md](../securite/SECURITE.md)). |

### Alternatives plus « radicales » (évaluation plus tard)

- **Rust** sur un service ultra-hot (souvent inutile si le goulot est SQL/IMAP).
- **Edge** (Workers) pour auth légère ou assets : complexité ops + modèle de confiance.
- **Read replicas** Postgres : coût et cohérence lecture/écriture.

Ces options ne remplacent pas une **cartographie des lenteurs réelles**.

---

## 6. Lien avec la sécurité

Toute optimisation doit rester compatible avec **[SECURITE.md](../securite/SECURITE.md)** et **[SECURITE.md](../securite/SECURITE.md)** : pas de désactivation des contrôles d’accès pour « aller plus vite », pas de cache partagé entre tenants, pas d’exposition de métriques sensibles sans auth.

---

## 7. Liens vers le reste de la doc

| Document | Complément |
|----------|------------|
| [TESTS.md](TESTS.md) | Où brancher des tests de charge plus tard ; aujourd’hui `make test` = régression fonctionnelle. |
| [STATUS.md](../../STATUS.md) | Avancement produit ; mention des chantiers perf. |
| [BACKLOG.md](../../BACKLOG.md) | Ligne « Observabilité / performances ». |
| [TODO.md](TODO.md) | Rappels court terme. |
| [PLAN.md](PLAN.md) | Dépannage console / bruit mesuré vs erreur. |
| [SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md) | Perf côté sync (mail, mobile, session). |
| [ROADMAP.md](../produit/ROADMAP.md) | **TR-06** observabilité, qualité & performances. |
| [ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md) | Rate limits, coût des couches « intelligentes », ordre AS-* (ne pas saturer la gateway avant mesure). |

---

## 8. Artefacts de profiling et Git

**Recommandation** : ne pas committer systématiquement les exports `profiling-data*.json`, `Trace-*.json`, `Trace-*.tgz` (taille, bruit, risque d’informations contextuelles). Le dépôt ignore ces motifs via [.gitignore](../../.gitignore) ; les conserver localement ou dans `reports/` éphémère selon votre flux CI. Un fichier **`profiling-data.27-02-2026.01-40-21.json`** ayant été versionné par erreur a été **retiré de l’index Git** (le fichier peut rester en local si besoin).

---

*Document vivant : à enrichir au fil des audits (tableaux de métriques réelles, budgets Web Vitals par route ; stack **Grafana/Prometheus** uniquement si ajoutés au compose — cf. **TR-06**).*

---

# Surveillance CLI (ressources)

## Surveillance ressources — Cloudity (CLI uniquement)

**Rôle** : guide pratique pour suivre **en continu** la consommation des
ressources (CPU, mémoire, IO, latence, taille images, taille DB, taille
volumes) de **chaque conteneur Cloudity** et **du projet entier**, **sans
passer par une interface web**. Ces outils servent à détecter une dérive
**avant** qu'elle ne devienne un incident, à comparer **avant/après** chaque
feature ou refactor, et à objectiver les optimisations.

> **Complément** : ce document est l'aspect **opérationnel et outillage** ;
> la **stratégie** (budgets cibles, leviers, alternatives) reste dans
> **[PERFORMANCES.md](PERFORMANCES.md)**. Le **dashboard admin web**
> (`/4dm1n` → Performance) est une **vue agrégée** ; ici on parle du **CLI
> dev** qui ne dépend pas de l'admin-service.

---

## 1. Pourquoi un outillage CLI dédié ?

Le projet possède déjà :

- L'endpoint admin **`GET /admin/performance/overview`** (snapshot live).
- L'endpoint **`GET /admin/performance/budget-status`** (vérif budgets).
- La table **`cloudity_performance_snapshots`** (historique côté DB).
- La table **`cloudity_performance_pipeline_runs`** (ingestion CI).

Mais : tout cela suppose que la **stack tourne**, que **admin-service est
joignable**, et qu'on regarde dans une UI. Pour **détecter en temps réel
qu'un service mange tout le CPU pendant qu'on développe**, ou pour
**comparer immédiatement avant/après un refactor**, on a besoin de
commandes shell **autonomes** qui parlent directement à Docker.

C'est ce que livrent les 4 scripts `scripts/dev/perf-*.sh`.

---

## 2. Les 4 scripts — quand les utiliser

| Script | Cas d'usage typique | Mode de sortie |
|--------|---------------------|----------------|
| **`perf-watch.sh`** | "Je code et je veux **garder un œil** sur la stack en temps réel sans ouvrir d'UI." | Boucle TTY (rafraîchit toutes les 3 s par défaut). Couleurs vert/jaune/rouge selon les budgets. `Ctrl+C` pour quitter. |
| **`perf-snapshot.sh`** | "Je vais commencer une feature / un refactor — je capture une **photo de référence** pour pouvoir comparer après." | Écrit `reports/perf/<ts>-<label>.json` (gitignoré). Sortie console : chemin du fichier + résumé. |
| **`perf-diff.sh`** | "J'ai fini la feature, je veux savoir **ce qui a coûté** par rapport à avant." | Diff visuel coloré ou JSON (`--json`). **Exit code 1** si une régression dépasse un seuil. |
| **`perf-budgets.sh`** | "Je veux un **gate** unique (CI, pré-commit, cron) qui dit OK ou KO selon les budgets actuels." | Une ligne console ou JSON (`--json`). **Exit code 0/1** strict. |

### 2.1 Cibles Makefile équivalentes

| Make | Script | Notes |
|------|--------|-------|
| `make perf-watch` | `perf-watch.sh` | Boucle infinie, Ctrl+C. |
| `make perf-watch-once` | `perf-watch.sh --once` | Une passe, stdout pipeable. |
| `make perf-snapshot LABEL=before-XXX` | `perf-snapshot.sh --label …` | LABEL optionnel (défaut `snapshot`). |
| `make perf-diff` | `perf-diff.sh` | Auto-pick 2 derniers snapshots. |
| `make perf-diff BEFORE=… AFTER=…` | `perf-diff.sh A B` | Comparer 2 fichiers explicites. |
| `make perf-budgets` | `perf-budgets.sh` | Format humain. |
| `make perf-budgets-json` | `perf-budgets.sh --json` | Format machine. |

---

## 3. Rituel "checkpoint perf" — à appliquer à chaque feature

> **Règle** : pour **toute** feature non triviale (> 200 lignes ajoutées, ou
> nouveau service, ou nouvelle dépendance lourde, ou modif d'une page web
> grosse > 1000 lignes), on capture **avant** et **après**, on compare, et
> on **colle le résultat** dans le commit ou la PR.

### 3.1 Workflow type

```bash
## 1. Avant la feature : snapshot baseline
make perf-snapshot LABEL=before-mailpage-split
##   -> reports/perf/20260513T181106Z-before-mailpage-split.json

## 2. … on développe la feature normalement …

## 3. Après stabilisation (tests verts, build OK) : nouveau snapshot
make perf-snapshot LABEL=after-mailpage-split
##   -> reports/perf/20260513T211523Z-after-mailpage-split.json

## 4. Diff visuel humain
make perf-diff
##   ou explicitement : 
##   make perf-diff BEFORE=reports/perf/20260513T181106Z-before-mailpage-split.json \
##                  AFTER=reports/perf/20260513T211523Z-after-mailpage-split.json

## 5. Diff JSON (pour coller dans le commit / PR description)
./scripts/dev/perf-diff.sh --json | jq '{totals_delta, regressions:(
  [.containers_delta[] | select(.cpu_pct_delta >= 10 or .memory_mib_delta >= 50)]
)}'
```

### 3.2 Template à coller dans le commit (ou la PR)

```markdown
## Checkpoint perf

| Métrique         | Avant | Après | Delta |
|------------------|------:|------:|------:|
| CPU sum (%)      | 3.6   | 4.1   | +0.5  |
| MEM sum (MiB)    | 561   | 612   | +51   |
| Images sum (MiB) | 12093 | 12093 | 0     |
| Conteneurs       | 16    | 16    | 0     |

**Régressions > seuil** : aucune.
**Justification (si delta > 0)** : nouveau worker queue ajouté (attendu).

`make perf-diff` → exit 0 ✅
```

### 3.3 Cas où on **doit** investiguer

- `perf-diff` retourne **exit 1** → au moins une métrique dépasse le seuil
  (`PERF_DELTA_CPU_PCT=10`, `PERF_DELTA_MEM_MB=50`, `PERF_DELTA_HEALTH_MS=200`).
- La taille **cumulée des images** augmente de **> 200 MiB** sans nouveau
  service → souvent un layer Docker mal cache, une dépendance lourde
  installée, ou des `node_modules` embarqués par erreur.
- Une **latence `/health`** d'un service > **200 ms** → le service est
  occupé à autre chose (boucle CPU, lock SQL, IO bloqué).

---

## 4. Budgets actuels (par défaut)

Adaptés à un laptop dev **8 vCPU / 16 GiB RAM** ; **à ajuster** sur la
prod VPS via les variables d'environnement listées en § 5.

### 4.1 Budgets *temps réel* (utilisés par `perf-watch.sh` et `perf-budgets.sh`)

| Variable | Défaut | Sens |
|----------|------:|------|
| `PERF_BUDGET_LOADAVG_1M` | **6.0** | Charge système moyenne 1 min — alerte si dépassée. |
| `PERF_BUDGET_CONTAINER_CPU_PCT` | **80** | CPU% par conteneur — alerte au-delà. |
| `PERF_BUDGET_TOTAL_CPU_PCT` | **200** | CPU% total **somme** des `cloudity-*`. |
| `PERF_BUDGET_CONTAINER_MEMORY_MB` | **600** | RAM par conteneur (MiB) — alerte au-delà. |
| `PERF_BUDGET_TOTAL_MEMORY_MB` | **4096** | RAM totale **somme** des `cloudity-*`. |

> Le `cloudity-web` (Vite dev + HMR) consomme légitimement plus que les
> services Go, c'est pour ça que le budget par-conteneur est à **600 MiB**
> par défaut. Pour la prod (Vite buildé statique servi par Nginx), on
> tombera à **80 MiB** typiquement.

### 4.2 Seuils *de régression* (utilisés par `perf-diff.sh`)

| Variable | Défaut | Sens |
|----------|------:|------|
| `PERF_DELTA_CPU_PCT` | **10** | CPU% en plus sur un conteneur entre 2 snapshots. |
| `PERF_DELTA_MEM_MB` | **50** | MiB en plus sur un conteneur. |
| `PERF_DELTA_HEALTH_MS` | **200** | ms en plus sur la latence `/health`. |

### 4.3 Lien avec les budgets côté admin-service

Les variables `PERF_BUDGET_*` sont **partagées** avec
**`backend/admin-service/app/routes/stats.py`** (endpoint
`/admin/performance/budget-status`). Définir une variable dans
`.env` ou `docker-compose.yml` la rend visible à la fois pour le
CLI **et** pour le dashboard.

---

## 5. Variables d'environnement (récap par script)

```bash
## perf-watch.sh / perf-budgets.sh
export PERF_BUDGET_LOADAVG_1M=4.0
export PERF_BUDGET_CONTAINER_CPU_PCT=70
export PERF_BUDGET_TOTAL_CPU_PCT=150
export PERF_BUDGET_CONTAINER_MEMORY_MB=400
export PERF_BUDGET_TOTAL_MEMORY_MB=3072

## perf-diff.sh
export PERF_DELTA_CPU_PCT=15
export PERF_DELTA_MEM_MB=80
export PERF_DELTA_HEALTH_MS=300

## Persistant : copier dans .env (ignoré par git) ou dans .envrc (direnv).
```

---

## 6. Format du fichier snapshot

Exemple **`reports/perf/20260513T181106Z-before-mailpage-split.json`** :

```json
{
  "label": "before-mailpage-split",
  "timestamp_utc": "2026-05-13T18:11:06Z",
  "host": "mon-laptop",
  "loadavg":  { "m1": 4.43, "m5": 4.22, "m15": 4.83 },
  "totals": {
    "container_count": 16,
    "cpu_pct_sum": 3.6,
    "memory_mib_sum": 561.4,
    "images_size_mib_sum": 12093
  },
  "containers": [
    { "name": "cloudity-admin-service", "cpu_pct": 2.6,
      "memory_mib": 45.8, "memory_pct": 0.11, "net_io": "123kB / 29.3kB",
      "block_io": "45.8MB / 0B", "pids": 4 }
    /* … */
  ],
  "images":   [ { "repository": "cloudity-admin-service", "tag": "latest",
                  "size_mib": 765, "created": "3 hours ago" } /* … */ ],
  "volumes":  [ { "name": "cloudity_postgres_data",   "size_mib": 412 } ],
  "health":   [ { "service": "auth-service", "url": "http://localhost:6001/health",
                  "latency_ms": 13, "ok": true } /* … */ ],
  "postgres": { "database_size_mib": 28.4, "active_connections": 24 }
}
```

**Ce que ça fournit déjà** :

- Détection d'une **fuite mémoire** sur un service (`memory_mib` qui croît
  entre snapshots successifs même au repos).
- **Pression** CPU localisée (un conteneur > 80% pendant l'idle).
- **Croissance d'images** Docker (passé de 12 GB → 14 GB ? il y a
  probablement un layer non cache ou un nouveau binaire embarqué).
- **DB qui gonfle** (alerte si `database_size_mib` augmente sans qu'on
  ait inséré beaucoup de données — souvent un index manquant, des
  audit_logs non purgés, etc.).
- **Latence /health** dégradée (signal early de saturation).

---

## 7. Intégrations possibles (futur)

- **Pré-commit hook** : `make perf-budgets || exit 0` *(soft fail :
  on prévient mais on ne bloque pas)*.
- **CI** : exécuter `make perf-budgets-json` dans le job e2e et
  ingérer le résultat via `POST /admin/performance/pipeline-run`
  (avec `X-Cloudity-Perf-Ingest`). La table
  `cloudity_performance_pipeline_runs` est déjà prévue pour ça.
- **Cron** : `*/5 * * * * cd /path/to/cloudity && ./scripts/dev/perf-snapshot.sh --label cron >/dev/null` →
  historique fin pour détecter une dérive sur 24 h.
- **Profiling lourd** : `pprof` sur les services Go (CPU/heap), Flutter
  DevTools sur les apps mobiles, React DevTools Profiler sur le web —
  voir [PERFORMANCES.md § 4](PERFORMANCES.md).

---

## 8. Anti-patterns à éviter

- **Ne pas committer** le dossier `reports/perf/` (déjà gitignoré via
  `reports/`). Les snapshots peuvent contenir des chemins hôte
  (`hostname`) ou des tailles de bases parlantes.
- **Ne pas comparer** deux snapshots faits dans des **conditions
  différentes** (un avec stack chaude / charge IDE active, un autre
  juste après `make up` à froid). Capturer dans **le même état** de la
  machine pour que le diff soit interprétable.
- **Ne pas ajuster les budgets pour faire taire l'alerte**. Si on
  dépasse régulièrement, soit on optimise, soit on documente une
  **dérogation** dans `PERFORMANCES.md` § leviers avec justification.

---

## 9. Cas concrets (exemples vécus / à venir)

| Situation | Outil pertinent | Action |
|-----------|------------------|--------|
| `make up` consomme **15 GB de RAM** à froid sur le laptop | `perf-watch` | Identifier les 2-3 conteneurs > 600 MiB → réduire `JVM_OPTS` / désactiver les services dev non utilisés (`adminer`, `redis-commander`) via le profil Docker. |
| Le **rebuild d'auth-service** prend **8 min** au lieu de 2 | `perf-snapshot` × 2 sur `images.size_mib` | Voir si une dépendance Go vient d'exploser ; sinon refactor du `Dockerfile` (multi-stage, cache layer). |
| Une page web **rame** (LCP > 4 s) | React DevTools Profiler + Lighthouse + `perf-watch` simultané | Croiser le rendu côté client avec la pression CPU/IO côté gateway/services. |
| Le **disque se remplit** | `perf-snapshot` (champ `volumes`) + `df -h` hôte | `cloudity_postgres_data` qui gonfle anormalement → audit `cloudity_audit_logs`, `cloudity_cve_snapshots`, `cloudity_performance_snapshots` (politique de rétention). |
| **Régression CPU** suspectée sur une PR | `make perf-snapshot LABEL=before-PR` puis `LABEL=after-PR` puis `make perf-diff` | Si `--exit 1` : reproduire en local avec un cas d'usage minimal, profiler le service incriminé. |

---

## 10. Liens

- **Stratégie perf** : [PERFORMANCES.md](PERFORMANCES.md)
- **Tests** : [TESTS.md](TESTS.md)
- **Backlog observabilité** : [BACKLOG.md](../../BACKLOG.md) — ligne « Observabilité & performances » + roadmap **TR-06**.
- **Backend admin endpoints performance** : `backend/admin-service/app/routes/stats.py`
- **Layout backend** (où vit chaque code) : [../architecture/BACKEND-LAYOUT.md](../architecture/BACKEND-LAYOUT.md)

---

*Document vivant : à compléter dès qu'un nouveau cas d'usage émerge ou
qu'un seuil de budget est ajusté en prod.*
