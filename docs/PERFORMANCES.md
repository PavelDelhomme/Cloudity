# Performances, diagnostic et allègement — Cloudity

**Rôle** : inventaire **factuel** de la stack actuelle (langages, conteneurs, services), **objectifs** (léger, rapide, observable) et **pistes** (y compris alternatives « gros gains ») **sans sacrifier la sécurité** ni une **UX** digne d’une suite grand public. Ce document est une **feuille de route technique** : rien n’y est entièrement « livré » côté observabilité produit tant que le backlog associé ([BACKLOG.md](../BACKLOG.md), **TR-06** dans [ROADMAP.md](./ROADMAP.md)) n’est pas coché.

**Dernière mise à jour** : 2026-04-11.

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
| **admin-service** | Python (Flask) | Admin ; volume moindre que le dashboard utilisateur mais à surveiller (cold start, GIL si CPU-bound). |
| **password-manager** | *(stack du service)* | Pass ; sensibilité sécurité > micro-optimisations naïves. |
| **mail-directory-service** | Go | IMAP + SQL ; sync et listes : **candidates** profiling SQL + goroutines. |
| **calendar-service**, **notes-service**, **tasks-service** | Go | CRUD + Postgres. |
| **drive-service** | Go | Fichiers, métadonnées ; IO et requêtes liste. |
| **photos-service** | Go | Timeline, médias. |
| **contacts-service** | Go | Liste / fiches. |
| **admin-dashboard** | React + Vite + TypeScript (Vitest) | **Bundle** client, **React Query**, listes virtuelles à étudier où nécessaire. |
| **adminer**, **redis-commander** | Outils | Dev uniquement. |

Fichiers de référence : [docker-compose.yml](../docker-compose.yml), variantes `docker-compose.*.yml`.

### 3.2 Clients mobiles

| Composant | Technologie | Piste perf |
|-----------|-------------|------------|
| **mobile/** (Flutter) | Dart, moteur Flutter | `flutter run --profile`, DevTools CPU/Memory ; images cache, isolates pour parsing lourd — [MOBILES.md](./MOBILES.md). |

### 3.3 Front web (admin-dashboard)

- **Build** : Vite (ESM, tree-shaking) ; dépendance à [ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md) pour découpage multi-apps.
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
| **Compression** | `gzip`/`brotli` au reverse proxy | TLS terminé correctement ([SECURITE.md](./SECURITE.md)). |
| **DB** | Index composés, éviter N+1, lectures read-only répliquées (futur) | Cohérence transactions. |
| **IMAP / Mail** | Sync incrémentale, moins de `SELECT` redondants, fenêtres UID | Déjà documenté partiellement dans [SYNC-BACKLOG.md](./SYNC-BACKLOG.md). |
| **Gateway** | Connection pooling vers upstreams, timeouts explicites | Éviter les cascades de lenteur. |
| **Front** | `React.lazy`, réduire re-renders (memo, contextes découpés) | Mesurer avec Profiler avant « memo partout ». |
| **Images / Photos** | Tailles multiples, WebP/AVIF, lazy load | Chiffrement / E2EE selon produit ([SECURITE.md](./SECURITE.md)). |

### Alternatives plus « radicales » (évaluation plus tard)

- **Rust** sur un service ultra-hot (souvent inutile si le goulot est SQL/IMAP).
- **Edge** (Workers) pour auth légère ou assets : complexité ops + modèle de confiance.
- **Read replicas** Postgres : coût et cohérence lecture/écriture.

Ces options ne remplacent pas une **cartographie des lenteurs réelles**.

---

## 6. Lien avec la sécurité

Toute optimisation doit rester compatible avec **[SECURITE.md](./SECURITE.md)** et **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** : pas de désactivation des contrôles d’accès pour « aller plus vite », pas de cache partagé entre tenants, pas d’exposition de métriques sensibles sans auth.

---

## 7. Liens vers le reste de la doc

| Document | Complément |
|----------|------------|
| [TESTS.md](./TESTS.md) | Où brancher des tests de charge plus tard ; aujourd’hui `make test` = régression fonctionnelle. |
| [STATUS.md](../STATUS.md) | Avancement produit ; mention des chantiers perf. |
| [BACKLOG.md](../BACKLOG.md) | Ligne « Observabilité / performances ». |
| [TODO.md](./TODO.md) | Rappels court terme. |
| [PLAN.md](./PLAN.md) | Dépannage console / bruit mesuré vs erreur. |
| [SYNC-BACKLOG.md](./SYNC-BACKLOG.md) | Perf côté sync (mail, mobile, session). |
| [ROADMAP.md](./ROADMAP.md) | **TR-06** observabilité, qualité & performances. |

---

## 8. Artefacts de profiling et Git

**Recommandation** : ne pas committer systématiquement les exports `profiling-data*.json`, `Trace-*.json`, `Trace-*.tgz` (taille, bruit, risque d’informations contextuelles). Le dépôt ignore ces motifs via [.gitignore](../.gitignore) ; les conserver localement ou dans `reports/` éphémère selon votre flux CI. Un fichier **`profiling-data.27-02-2026.01-40-21.json`** ayant été versionné par erreur a été **retiré de l’index Git** (le fichier peut rester en local si besoin).

---

*Document vivant : à enrichir au fil des audits (tableaux de métriques réelles, captures Grafana, budgets Web Vitals par route).*
