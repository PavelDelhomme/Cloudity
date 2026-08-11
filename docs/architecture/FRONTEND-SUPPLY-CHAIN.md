# Front Cloudity — chaîne d’approvisionnement npm (sortie progressive)

> **Pilotage** : cycle `cycle-frontend-supply` · tâches **FE-SEC-SUPPLY-01…07**.  
> **Principe** : on ne « jette pas React demain » — on **réduit le risque npm** sans perdre de fonctionnalité, puis on migre les couches critiques hors de l’écosystème npm.

## Constat (2026-08)

| Surface | Gestionnaire | Ordre de grandeur |
|---------|--------------|-------------------|
| `frontend/` (workspaces) | **npm** + `package-lock.json` | **556** entrées lockfile (snapshot 2026-08-06) |
| Extensions Pass Chrome/Firefox | npm | Build MV3 (arbre séparé) |
| Backend | Go / Python | **hors npm** (cible à renforcer) |
| Mobile | Flutter / pub | hors npm |

**Inventaire FE-SEC-SUPPLY-01** : [`docs/architecture/npm-supply/INVENTORY-20260806.md`](npm-supply/INVENTORY-20260806.md) (copie ; snapshots bruts sous `reports/` gitignored).

| Audit | Résultat |
|-------|----------|
| Total | 9 (6 high, 0 critical) |
| Scripts install dans lock | 0 |
| Priorité patch | **axios** (+ transitives form-data) |

Les registres npm ont un historique de paquets compromis, typosquatting, scripts `postinstall` malveillants. Cloudity doit traiter ça comme **priorité structurelle**, au même titre que H19 / FE-HUB.

## Ce qu’on ne fait PAS

- Réécrire toute la SPA React en Go/Rust en une PR (régression produit garantie).
- Remplacer npm par un autre gestionnaire **qui tire encore le même registry** sans durcissement (Bun seul ≠ sécurité).
- Couper les apps avant d’avoir un plan de parité fonctionnelle.

## Cible long terme (sans perte de features)

1. **UI** : rester navigateur (SPA ou SSR) — candidats évalués : React durci → éventuellement **Flutter Web** (aligné mobile) pour surfaces critiques, ou pages **Go templates + HTMX** pour admin/ops.
2. **Crypto / vault / Pass** : logique sensible en **Go ou Rust → WASM** (déjà amorcé : `pass-crypto`, `app-vault-crypto`) — **zéro secret en JS pur non audité**.
3. **Build** : toolchain verrouillée (CI Docker, lockfile, pas d’install scripts host).
4. **Runtime prod** : images distroless / nginx static ; pas de `npm install` sur le VPS.

## Phases & sous-tâches

### Phase A — Contenir npm **maintenant** (FE-SEC-SUPPLY-01…03)

| ID | Sous-tâche | Critère de done |
|----|------------|-----------------|
| **A1** | Inventaire deps directes vs transitives (`npm ls --all`, top vulnérables) | Rapport dans `reports/` + tableau dans ce doc |
| **A2** | CI : `npm audit --omit=dev` (ou `pnpm audit`) **bloquant** sur HIGH/CRITICAL | Job `make test-security` / dashboard-lint vert ou override documenté |
| **A3** | Interdire scripts install dangereux : `ignore-scripts=true` + allowlist explicite | `.npmrc` + doc |
| **A4** | Pin exact + `npm ci` only en CI/Docker (déjà partiel) | Pas de `^` nouveaux sans revue |
| **A5** | SBOM CycloneDX front généré en CI | Artefact attaché release |

### Phase B — Réduire la surface (FE-SEC-SUPPLY-04)

| ID | Sous-tâche | Critère |
|----|------------|---------|
| **B1** | Remplacer / retirer deps lourdes peu critiques (icônes, date utils redondantes) | −N packages lockfile mesurable |
| **B2** | Isoler `@cloudity/web-mail` : deps peer-only, pas de duplication | `web-mail` build sans tree npm double |
| **B3** | Extensions Pass : build reproductible + audit séparé | `make test-pass-extension` + audit OK |

### Phase C — Sortir le sensible de JS (FE-SEC-SUPPLY-05)

| ID | Sous-tâche | Critère |
|----|------------|---------|
| **C1** | Audit `pass-crypto` / `app-vault-crypto` : chemin critique documenté | Doc + tests |
| **C2** | Port crypto restant → WASM (Go/Rust) appelé depuis le front | API stable, tests parité |
| **C3** | Interdire nouvelles libs crypto npm sans RFC sécurité | Règle Cursor / CONTRIBUTING |

### Phase D — Alternatives UI (FE-SEC-SUPPLY-06…07)

| ID | Sous-tâche | Critère |
|----|------------|---------|
| **D1** | Spike 2 semaines : **Flutter Web** pour Hub + Settings (même API) | Démo `/app` parité basique |
| **D2** | Spike : **admin** en Go (templates/HTMX) pour `/4dm1n` ops | Parité Pilotage lecture |
| **D3** | Décision écrite : rester React durci **ou** bascule progressive | ADR dans `docs/architecture/` |
| **D4** | Si bascule : plan migration app par app (Mail déjà split) | Checklist Pilotage |

## Ordre d’exécution recommandé

```
A1 → A3 → A2 → A4 → B1 → C1 → C2 → D1/D2 → D3
```

Ne pas démarrer D avant A+C1 (sinon on migre un monolithe encore vulnérable).

## Liens

- Pilotage `/4dm1n/pilotage` → Sync docs → cycle **Front supply-chain / sortie npm**
- Sécurité tests : `docs/operations/TESTS.md` (govulncheck / npm audit)
- Multi-apps : `docs/architecture/MULTI-APPS-WEB-MOBILE.md`

### FE-SEC-SUPPLY-02 — notes d’implémentation (2026-08-11)

- **npm 12** bloque les scripts d’install par défaut ; allowlist via `allowScripts` dans `frontend/package.json` et `extensions/cloudity-pass/package.json` (`esbuild@0.28.0`).
- Install durcie : `./scripts/frontend/npm-ci-hardened.sh` (`npm ci` + approve/rebuild esbuild).
- `make build-pass-extension` restaure `frontend/node_modules` si les deps de `pass-crypto` / `@cloudity/ui` manquent.
- **Audit HIGH bloquant** : `make test-security` (`NPM_AUDIT_BLOCKING=1` par défaut) + workflow `.github/workflows/frontend-npm-audit.yml`.
- Dockerfiles front : `npm ci` + `npm rebuild esbuild`.
- Patches HIGH : `brace-expansion`, `nanoid` (via `docx`).
- **Waiver moderate** : `react-router` / `react-router-dom` v6 — bump v7 = breaking ; suivi SUPPLY-04 / migration planifiée. Ne bloque pas `--audit-level=high`.

### FE-SEC-SUPPLY-03 — pin + SBOM (amorcé)

- SBOM : `./scripts/frontend/sbom-cyclonedx.sh` → `reports/sbom/frontend-cyclonedx.json` (aussi artefact CI du workflow audit).
- Politique pin : nouvelles deps runtime en version **exacte** (pas de `^` sans revue) — voir § pin ci-dessous et `VERSIONNAGE-LIBS.md`.

#### Politique pin (frontend)

| Règle | Détail |
|-------|--------|
| Nouvelles deps **runtime** | Version exacte dans `package.json` (`"1.2.3"`) ; lockfile via `npm ci` |
| Tooling / devDeps | `^` acceptable si lockfile commité |
| CI / Docker | **`npm ci` only** — jamais `npm install` sur image prod |
| Override | Documenter dans ce fichier + note Pilotage si CVE force un override |

*Dernière mise à jour : 2026-08-11.*
