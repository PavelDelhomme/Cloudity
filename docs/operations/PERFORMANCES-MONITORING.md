# Surveillance ressources — Cloudity (CLI uniquement)

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
# 1. Avant la feature : snapshot baseline
make perf-snapshot LABEL=before-mailpage-split
#   -> reports/perf/20260513T181106Z-before-mailpage-split.json

# 2. … on développe la feature normalement …

# 3. Après stabilisation (tests verts, build OK) : nouveau snapshot
make perf-snapshot LABEL=after-mailpage-split
#   -> reports/perf/20260513T211523Z-after-mailpage-split.json

# 4. Diff visuel humain
make perf-diff
#   ou explicitement : 
#   make perf-diff BEFORE=reports/perf/20260513T181106Z-before-mailpage-split.json \
#                  AFTER=reports/perf/20260513T211523Z-after-mailpage-split.json

# 5. Diff JSON (pour coller dans le commit / PR description)
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
# perf-watch.sh / perf-budgets.sh
export PERF_BUDGET_LOADAVG_1M=4.0
export PERF_BUDGET_CONTAINER_CPU_PCT=70
export PERF_BUDGET_TOTAL_CPU_PCT=150
export PERF_BUDGET_CONTAINER_MEMORY_MB=400
export PERF_BUDGET_TOTAL_MEMORY_MB=3072

# perf-diff.sh
export PERF_DELTA_CPU_PCT=15
export PERF_DELTA_MEM_MB=80
export PERF_DELTA_HEALTH_MS=300

# Persistant : copier dans .env (ignoré par git) ou dans .envrc (direnv).
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
