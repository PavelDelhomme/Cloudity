# Changelog — internalsec

Toutes les modifications notables de la lib Go `internalsec` sont consignées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage : [SemVer](https://semver.org/lang/fr/).

> Convention : tant que la lib n'est pas publiée sur l'org GitHub définitive (cf. **REPONSES.md** Q4=B), aucun tag Git `internalsec/v*` n'est poussé. Les versions sont déclarées ici et appliquées en tags **dès que l'org cible est fixée**.

## [0.2.0] — 2026-05-12

### Sécurité

- **TLS** : `ServerTLS` et `ClientTLS` posent désormais explicitement `CurvePreferences = [X25519, secp256r1]` dans le `*tls.Config` retourné. X25519 en priorité 1 (le plus rapide + résistant aux side-channels timing), secp256r1 en fallback. Aucun impact runtime — le comportement par défaut de Go était déjà similaire — mais on rend l'intention **explicite** et auditable.

### Documentation

- Renvoi vers **[../../docs/securite/CRYPTO-NORME.md](../../docs/securite/CRYPTO-NORME.md)** § 1.6 et § 4.1 (référentiel actionnable de la crypto Cloudity).

## [0.1.0] — 2026-05-12

Première version stable de l'API. Couvre la sécurité applicative interne du backend Cloudity (helpers communs entre `auth-service`, `passwords-service`, `api-gateway`, `admin-service`).

Cf. **[../../docs/architecture/VERSIONNAGE-LIBS.md](../../docs/architecture/VERSIONNAGE-LIBS.md)** pour le contexte.

### Fonctionnalités stabilisées

- Hashage / vérification de secrets (Argon2id avec paramètres alignés sur `passwords-service`).
- Génération aléatoire cryptographiquement sûre (helpers `crypto/rand`).
- Vérification de tokens JWT RS256 (clés publiques chargées depuis disque, pas de cache TTL).
- Helpers de constants-time comparison.

### Garanties

- API stable jusqu'à v0.2.0 (changements compatibles uniquement) ou v1.0.0 (signal de stabilité long terme).
- Pas de dépendance externe Go (uniquement bibliothèque standard + `golang.org/x/crypto`).
- Couverture de tests : voir `internalsec_test.go` (`go test ./...`).

---

*Format des entrées suivantes : `## [X.Y.Z] — YYYY-MM-DD` avec sections `Ajouté`, `Modifié`, `Déprécié`, `Retiré`, `Corrigé`, `Sécurité`.*
