# gosec — triage et baseline

**Outil** : [securego/gosec](https://github.com/securego/gosec) — intégré à **`make test-security`** (mode WARNING par défaut).

## Commandes

| Action | Commande |
|--------|----------|
| Batterie complète | `make test-security` |
| Rapport par service | `reports/gosec-<service>.txt` |
| Échec CI volontaire | `GOSEC_BLOCKING=1 make test-security` |

## Configuration

Fichier racine **`.gosec.json`** : exclusions documentées (faux positifs récurrents Cloudity).

| Règle | Traitement |
|-------|------------|
| **G114** | Stub `cmd/main.go` — prod via `http.Server` + timeouts |
| **G304 / G703** | Lecture clés / CA depuis chemins **env** opérateur |
| **G306** | `0644` sur clés **publiques** JWT (gateway RO) |
| **G115** | Casts WebAuthn |
| **G706** | Logs config opérateur (pas d'injection utilisateur) |
| **G104** | Exclu globalement (LOW) — corriger progressivement (`rows.Close`, `SetTrustedProxies`, etc.) |

## Branches

| Chantier | Branche |
|----------|---------|
| Baseline + corrections | `feat/security-gosec-hardening` |
| 2FA admin U9 | `feat/admin-u9-2fa-advanced` |
| Audit mobile H6c | `feat/security-mobile-audit` |

Voir aussi **[CRYPTO-NORME.md](CRYPTO-NORME.md)** § 8.1 et **BACKLOG.md** (Q20).
