# Changelog — @cloudity/shared

Toutes les modifications notables de la lib TS/React `@cloudity/shared` sont consignées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage : [SemVer](https://semver.org/lang/fr/).

> Convention : tant que la lib n'est pas publiée sur l'org npm définitive (cf. **REPONSES.md** Q4=B), `"private": true` reste actif et aucun tag Git `cloudity-shared/v*` n'est poussé. Les versions sont déclarées ici et appliquées en tags + `npm publish` **dès que l'org cible est fixée**.

## [0.1.0] — 2026-05-12

Première version stable de l'API. Lib partagée entre `frontend/apps/cloudity-web` et `frontend/apps/admin-dashboard` ; futur point d'extraction vers le dépôt `cloudity-shared-web`.

Cf. **[../../../docs/architecture/VERSIONNAGE-LIBS.md](../../../docs/architecture/VERSIONNAGE-LIBS.md)** pour le contexte.

### Fonctionnalités stabilisées

- `apiFetch(token, path, init?)` — helper HTTP vers le gateway Cloudity, gestion 401/403, JSON par défaut.
- `getAuthHeaders(token)` — construit les headers `Authorization: Bearer …` + `X-Cloudity-Tenant` si présent.
- `jwtExpiry(token)` — décode l'expiration d'un JWT (sans vérif de signature côté client).
- `jwtRole(token)` — extrait le rôle (`admin`, `user`, …) du payload JWT.
- `PageLayout` — composant React de layout commun (header / footer / breadcrumbs).
- `cloudityCore` — namespace export central.
- `adminUiPath` — constante du chemin admin (`/4dm1n`).

### Garanties

- API stable jusqu'à v0.2.0 (changements compatibles uniquement) ou v1.0.0 (signal de stabilité long terme).
- Aucune dépendance runtime hors `react` (peer dependency `^18.2.0`).
- Compatible Vite (ESM uniquement, `"type": "module"`).

---

*Format des entrées suivantes : `## [X.Y.Z] — YYYY-MM-DD` avec sections `Ajouté`, `Modifié`, `Déprécié`, `Retiré`, `Corrigé`, `Sécurité`.*
