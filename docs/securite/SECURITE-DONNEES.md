# Sécurité et chiffrement des données — Cloudity

> **Vision longue** (suite Google + confiance Proton, phases, signatures, Zero Trust, WAF, **post-quantique**) : **[SECURITE.md](SECURITE.md)** (§ 8 PQ).  
> **Référence produit** : chantier transversal détaillé dans **[ROADMAP.md](../produit/ROADMAP.md)** (TR-01). Tableau algorithmes (incluant **cible post-quantique**) dans **[STATUS.md](../../STATUS.md)** (§ 2.3). Tests sécurité → **[TESTS.md](../operations/TESTS.md)** (`make test-security`). Index → **[README.md](../README.md)**.

## Déjà en place (rappel — état réel du code)

- **Transport** : HTTPS en production (terminaison **TLS 1.3** cible au reverse-proxy ou load balancer ; en dev, **HTTP** local sur `6001`).  
- **Authentification** : JWT signés en **RS256** (RSA-2048, `auth-service`) ; **refresh tokens** aléatoires 256 bits stockés **hashés en SHA-256** dans Redis (TTL 30 j, rotation à chaque refresh) ; session côté client en `localStorage` aujourd’hui — à durcir avec **cookies httpOnly + Secure + SameSite=strict**.  
- **Renouvellement JWT (UX liée)** : le front rafraîchit le token au focus ; les **aperçus Drive** (PDF, médias) utilisent une **ref** sur le token dans les effets de chargement pour ne pas **révoquer/recharger** le blob à chaque rotation d’accès si le fichier affiché est inchangé (comportement perçu comme « rechargement au changement d’app »).  
- **Hashing mots de passe utilisateur** : **Argon2id** (paramètres par défaut de la lib `alexedwards/argon2id`) ; fallback **bcrypt cost 12** pour rétrocompatibilité ; détection automatique selon préfixe du hash.  
- **Chiffrement applicatif au repos (Mail)** : `password_encrypted` IMAP/SMTP et `oauth_refresh_token_encrypted` Gmail OAuth chiffrés en **AES-256-GCM** (clé 32 octets via `MAIL_PASSWORD_ENCRYPTION_KEY`, nonce 96 bits, format stocké `nonce|ciphertext` base64 — `backend/mail-directory-service/main.go`).  
- **Vault Pass** : la table `pass_items` ne stocke qu’un **`ciphertext`** opaque (chiffrement client à figer en hybride PQ — voir **[SECURITE.md](SECURITE.md)** § 8.2).  
- **CORS** : limité par l’API Gateway (`CORS_ORIGINS`, réseau local en dev).  
- **En-têtes HTTP (image nginx du service `cloudity-web`)** : `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` sur l’image de production. **HSTS** et **CSP** : voir gabarits commentés dans **`frontend/apps/cloudity-web/nginx.conf`** (à activer derrière TLS).  
- **Inter-services** : HTTP plain sur le réseau Docker `cloudity-network`, Postgres en **`sslmode=disable`**, Redis avec mot de passe sans TLS — **mTLS interne** documenté en cible (**[SECURITE.md](SECURITE.md)** § 5 et **[AUDIT-SECURITE-ADMIN-API.md](AUDIT-SECURITE-ADMIN-API.md)**).

## Pistes d’amélioration (priorisées)

### Court terme

- **Cookies httpOnly + SameSite=strict** pour les tokens (nécessite adaptation gateway et frontend).  
- **CSP** (Content-Security-Policy) sur le HTML, testée progressivement pour ne pas casser les intégrations (ex. mail HTML).  
- **HSTS** au reverse-proxy une fois TLS 1.3 strict en place.  
- **Rotation des secrets** et variables d’environnement hors du dépôt (Vault, secrets manager).  
- **mTLS interne** (step-ca / cert-manager) — **prérequis** à toute brique post-quantique inter-services.

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
