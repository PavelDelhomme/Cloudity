# Sécurité et chiffrement des données — Cloudity

> **Vision longue** (suite Google + confiance Proton, phases, signatures, Zero Trust, WAF, **post-quantique**) : **[SECURITE.md](SECURITE.md)** (§ 8 PQ).
> **Référence produit** : chantier transversal détaillé dans **[ROADMAP.md](../produit/ROADMAP.md)** (TR-01). Tableau algorithmes (incluant **cible post-quantique**) dans **[STATUS.md](../../STATUS.md)** (§ 2.3). Tests sécurité → **[TESTS.md](../operations/TESTS.md)** (`make test-security`). Index → **[README.md](../README.md)**.

## Déjà en place (rappel — état réel du code)

- **Transport** : HTTPS en production (terminaison **TLS 1.3** cible au reverse-proxy ou load balancer). En **dev local**, possibilité de basculer en HTTPS via **`make dev-https`** (mkcert + Vite — `scripts/dev/dev-https.sh`).
- **Authentification** : JWT signés en **EdDSA (Ed25519)** côté `auth-service` (`kid="ed25519-1"`) ; **rétrocompat RS256** acceptée par la gateway tant que des refresh tokens RS256 historiques expirent (cf. **[CRYPTO-NORME.md](CRYPTO-NORME.md)** § 5). **Refresh tokens** aléatoires 256 bits stockés **hashés en SHA-256** dans Redis (TTL 30 j, rotation à chaque refresh) ; session côté client en `localStorage` aujourd’hui — à durcir avec **cookies httpOnly + Secure + SameSite=strict**.
- **Renouvellement JWT (UX liée)** : le front rafraîchit le token au focus ; les **aperçus Drive** (PDF, médias) utilisent une **ref** sur le token dans les effets de chargement pour ne pas **révoquer/recharger** le blob à chaque rotation d’accès si le fichier affiché est inchangé.
- **Hashing mots de passe utilisateur** : **Argon2id** paramètres explicites **m=64 MiB / t=3 / p=4** (override via `ARGON2_MEMORY_KB` / `ARGON2_TIME` / `ARGON2_PARALLELISM`) ; fallback **bcrypt cost 12** pour rétrocompatibilité ; détection automatique selon préfixe du hash.
- **Chiffrement applicatif au repos (Mail)** : `password_encrypted` IMAP/SMTP et `oauth_refresh_token_encrypted` Gmail OAuth chiffrés en **AES-256-GCM** (clé 32 octets via `MAIL_PASSWORD_ENCRYPTION_KEY`, nonce 96 bits, format stocké `nonce|ciphertext` base64 — `backend/mail-directory-service/main.go`).
- **Vault Pass** : la table `pass_items` ne stocke qu’un **`ciphertext`** opaque (chiffrement client à figer en hybride PQ — voir **[PASS-CRYPTO.md](PASS-CRYPTO.md)**).
- **Sessions admin (gateway)** : **Origin** strict + **JWT EdDSA + rôle admin** sur tout `/admin/*` ; **`POST /admin/performance/pipeline-run`** exige aussi **`X-Cloudity-Perf-Ingest`** (`PERFORMANCE_INGEST_TOKEN` configuré côté gateway **et** admin-service ; sinon **503**) — cf. **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)** § 2-3.
- **Sanitisation headers de confiance** : la gateway **strippe** systématiquement `X-User-ID`, `X-Tenant-ID`, `X-Admin-Role` avant ré-injection après vérif JWT (`stripInternalTrustHeaders` — empêche un client de pré-positionner ces valeurs).
- **Mail admin-only en defense in depth** : `mail-directory-service` revérifie **`X-Admin-Role: admin`** sur `/mail/{domains,mailboxes,aliases}*` (rejet 403 même si la requête contourne la gateway) — `requireAdminRoleForMailDirectory`.
- **CORS** : limité par l’API Gateway (`CORS_ORIGINS`, réseau local en dev), durci en prod (liste explicite, `CORS_ALLOW_LAN=false`).
- **En-têtes HTTP** :
  - **Gateway** : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, **`Cache-Control: no-store`** sur `/auth/*`, `/pass/*`, `/admin/*`.
  - **Image nginx web** : `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, **refus explicite `/admin*`** ; **HSTS** et **CSP** : gabarits commentés dans **`frontend/apps/cloudity-web/nginx.conf`** (à activer derrière TLS).
- **Inter-services (réalité dev)** : HTTP plain sur le réseau Docker `cloudity-network`, Postgres en **`sslmode=disable`**, Redis avec mot de passe sans TLS — **mTLS interne** documenté en cible (**[MTLS-INTERNE.md](MTLS-INTERNE.md)**).

## Pistes d’amélioration (priorisées)

### Court terme

- **Cookies httpOnly + SameSite=strict** pour les tokens (nécessite adaptation gateway et frontend).
- **CSP** (Content-Security-Policy) sur le HTML, testée progressivement pour ne pas casser les intégrations (ex. mail HTML).
- **HSTS** au reverse-proxy une fois TLS 1.3 strict en place.
- **Rotation des secrets** : `make secrets` pour générer (POSTGRES, REDIS, JWT_SECRET, PERFORMANCE_INGEST_TOKEN) ; viser un **secrets manager** (Vault / SOPS) en prod.
- **mTLS interne** (step-ca / cert-manager) — **prérequis** à toute brique post-quantique inter-services. Plan **[MTLS-INTERNE.md](MTLS-INTERNE.md)**.
- **Postgres `sslmode=verify-full`** + **Redis `rediss://`** : à enchaîner avec mTLS interne pour fermer le périmètre Zero Trust.

### Moyen terme

- **Chiffrement au repos** pour Postgres / volumes (disques chiffrés, TDE ou colonnes sensibles en `pgcrypto` pour champs critiques).  
- **Audit** des accès admin et des actions sensibles (export, suppression masse).  
- **TLS 1.3 hybride post-quantique** (`X25519MLKEM768`) au reverse-proxy quand la chaîne TLS le supporte (Caddy 2.8+, nginx + OpenSSL 3.5+, AWS-LC, BoringSSL).  
- **JWT** : palier **Ed25519** avant cible **ML-DSA-65** ou JWT hybride.

### Long terme (mail / pass « au top »)

- **Pass** : chiffrement côté client (clé dérivée du mot de passe utilisateur) + coffre chiffré côté serveur (modèle type Bitwarden) — **figer dès le MVP** un format **hybride post-quantique** : contenu en `ChaCha20-Poly1305` + clé encapsulée en **`X25519 ⊕ ML-KEM-768`**, KDF **Argon2id** + **HKDF-SHA-256**.  
- **Mail** : chiffrement E2E type S/MIME ou **OpenPGP** côté client, cible **PQ/T hybrid OpenPGP** (drafts IETF) — incompatible avec une simple synchronisation IMAP classique sans adaptation.  
- **Drive / Photos privés** : chunks **AES-256-GCM** ou **XChaCha20-Poly1305** + clé fichier par destinataire en **`X25519 + ML-KEM-768`**.

## Tests

- **Unitaires / intégration** (Vitest) : règles métier, navigation, formulaires.  
- **E2E** (Playwright) : parcours critiques contre une stack réelle (`BASE_URL=http://localhost:6001`).  
- **Sécurité** : dépendances (`npm audit`, `govulncheck`), scans SAST/DAST en CI quand le dépôt est branché sur une forge.

Ce document complète **[TODO.md](../operations/TODO.md)** (notes dev) et **[EVOLUTION-PLATEFORME.md](../architecture/EVOLUTION-PLATEFORME.md)** (infra). Les **décisions produit** et le périmètre sécurité par app sont dans **[ROADMAP.md](../produit/ROADMAP.md)** (TR-01). Cible **post-quantique** détaillée dans **[SECURITE.md](SECURITE.md)** § 8 et **[STATUS.md](../../STATUS.md)** § 2.3.
