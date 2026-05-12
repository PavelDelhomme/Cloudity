# Changelog — cloudity_shared (Dart / Flutter)

Toutes les modifications notables de la lib Dart `cloudity_shared` sont consignées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage : [SemVer](https://semver.org/lang/fr/).

> Convention : tant que la lib n'est pas publiée sur pub.dev (cf. **REPONSES.md** Q4=B), `publish_to: 'none'` reste actif et aucun tag Git `cloudity_shared/v*` n'est poussé. Les apps Flutter du monorepo (`mobile/mail`, `mobile/drive`, `mobile/photos`, plus tard `mobile/pass` et `mobile/admin`) consomment la lib via `path: ../cloudity_shared` ; après publication, ils basculeront sur `git: ref: v0.1.0` ou `cloudity_shared: ^0.1.0`.

## [0.1.0] — 2026-05-12

Première version stable de l'API. Helpers HTTP alignés sur `@cloudity/shared` côté web (parité d'authentification entre web et mobile).

Cf. **[../../docs/architecture/VERSIONNAGE-LIBS.md](../../docs/architecture/VERSIONNAGE-LIBS.md)** pour le contexte.

### Fonctionnalités stabilisées

- `getAuthHeaders(token)` — construit les headers `Authorization: Bearer …` + `Content-Type: application/json` (parité côté web).
- *(prévu prochaines versions : helpers `apiFetch`, gestion refresh token, types JWT communs).*

### Garanties

- API stable jusqu'à v0.2.0 (changements compatibles uniquement) ou v1.0.0 (signal de stabilité long terme).
- Aucune dépendance runtime (helpers purs sur `Map<String, String>` / `String`).
- Compatible Flutter SDK ≥ 3.11.4 (Dart 3).

---

*Format des entrées suivantes : `## [X.Y.Z] — YYYY-MM-DD` avec sections `Ajouté`, `Modifié`, `Déprécié`, `Retiré`, `Corrigé`, `Sécurité`.*
