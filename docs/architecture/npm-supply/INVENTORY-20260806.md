# Inventaire npm Cloudity — 2026-08-06 (FE-SEC-SUPPLY-01)

Branche : `feat/notes-google-keep`  
Artefacts locaux (gitignored) : `reports/npm-supply/npm-audit-20260806.json`  
Copie suivie git : ce fichier.

## Synthèse

| Métrique | Valeur |
|----------|--------|
| Fichiers `package.json` workspace | 8 (+1 artefact Vite deps ignoré) |
| Entrées `package-lock.json` | **556** |
| Paquets lock avec scripts install/prepare | **0** (bon signal) |
| Vulns audit (npm) | **9** total · **6 high** · 0 critical · 2 moderate · 1 low |

## Dépendances directes (runtime)

| Package | Runtime deps notables |
|---------|----------------------|
| `@cloudity/web` | react, react-router, tanstack-query, axios, lucide, pdfjs, mammoth, docx, excel, marked, turndown, web-mail, crypto locaux |
| `@cloudity/web-mail` | react stack + shared/ui (duplique peers) |
| `@cloudity/pass-crypto` | `@noble/*`, `cbor-x`, `hash-wasm` |
| `@cloudity/app-vault-crypto` | pass-crypto |
| Extensions Pass | hors ce workspace (chemins `extensions/`) |

## Top HIGH (audit 2026-08-06)

| Sévérité | Paquet | Note |
|----------|--------|------|
| high | axios | DoS formDataToJSON — **upgrade axios** |
| high | brace-expansion | DoS — souvent transitive |
| high | form-data | CRLF — transitive axios |
| high | js-yaml | DoS — souvent tooling |
| high | postcss | path traversal sourcemap — tooling build |
| high | undici | TLS bypass — souvent transitive Node |

→ Action immédiate (SUPPLY-02/04) : bump **axios** (+ audit re-run) ; classer tooling vs runtime.

## Risques structurels (top 10)

1. **Surface lockfile 556** — trop large pour revue manuelle continue.
2. **axios** runtime avec CVE high — patch prioritaire.
3. **Office parsers** (pdfjs, mammoth, docx, excel) — surface attaque fichiers utilisateur.
4. **Duplication** react stack web-mail vs cloudity-web.
5. **Pas encore** `ignore-scripts` forcé dans `.npmrc` workspace (scripts lock=0 aujourd’hui, mais pas garanti demain).
6. **Pas d’audit bloquant** systématique en `make test` unit path.
7. **Pas de SBOM** CycloneDX front en CI.
8. **Crypto npm** (`@noble/*`, hash-wasm) — acceptable court terme, cible WASM (SUPPLY-05).
9. Extensions Pass = **second** arbre npm à auditer séparément.
10. Confondre **Nginx Proxy Manager (NPM)** ops avec **npm** registry — vocabulaire Pilotage clarifié.

## Critères FE-SEC-SUPPLY-01

- [x] Snapshot audit archivé
- [x] Liste deps directes
- [x] Top risques dans FRONTEND-SUPPLY-CHAIN.md
- [ ] Sync docs Pilotage (à faire côté UI après push)

## Suite

**FE-SEC-SUPPLY-02** : `.npmrc` + CI audit · bump axios.
