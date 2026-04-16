# Sécurité et chiffrement des données — Cloudity

> **Référence produit** : chantier transversal détaillé dans **[ROADMAP.md](./ROADMAP.md)** (TR-01). Tableau algorithmes dans **[STATUS.md](../STATUS.md)** (§ 2.3). Tests sécurité → **[TESTS.md](./TESTS.md)** (`make test-security`). Index → **[README.md](./README.md)**.

## Déjà en place (rappel)

- **Transport** : HTTPS en production (terminaison TLS au reverse-proxy ou au load balancer).  
- **Authentification** : JWT / refresh côté API ; session stockée côté client de façon contrôlée (`localStorage` aujourd’hui — à durcir avec httpOnly cookies si besoin).  
- **Renouvellement JWT (UX liée)** : le front rafraîchit le token au focus ; les **aperçus Drive** (PDF, médias) utilisent une **ref** sur le token dans les effets de chargement pour ne pas **révoquer/recharger** le blob à chaque rotation d’accès si le fichier affiché est inchangé (comportement perçu comme « rechargement au changement d’app »).  
- **CORS** : limité par l’API Gateway (`CORS_ORIGINS`, réseau local en dev).  
- **En-têtes HTTP (nginx `admin-dashboard`)** : `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` sur l’image de production.

## Pistes d’amélioration (priorisées)

### Court terme

- **Cookies httpOnly + SameSite=strict** pour les tokens (nécessite adaptation gateway et frontend).  
- **CSP** (Content-Security-Policy) sur le HTML, testée progressivement pour ne pas casser les intégrations (ex. mail HTML).  
- **Rotation des secrets** et variables d’environnement hors du dépôt (Vault, secrets manager).

### Moyen terme

- **Chiffrement au repos** pour Postgres / volumes (disques chiffrés, TDE ou colonnes sensibles en `pgcrypto` pour champs critiques).  
- **Audit** des accès admin et des actions sensibles (export, suppression masse).

### Long terme (mail / pass « au top »)

- **Pass** : chiffrement côté client (clé dérivée du mot de passe utilisateur) + coffre chiffré côté serveur (modèle type Bitwarden) — gros chantier, spécification dédiée.  
- **Mail** : chiffrement E2E type S/MIME ou OpenPGP côté client, ou stockage chiffré des corps sur le serveur avec clés gérées par le tenant — incompatible avec une simple synchronisation IMAP classique sans adaptation.

## Tests

- **Unitaires / intégration** (Vitest) : règles métier, navigation, formulaires.  
- **E2E** (Playwright) : parcours critiques contre une stack réelle (`BASE_URL=http://localhost:6001`).  
- **Sécurité** : dépendances (`npm audit`, `govulncheck`), scans SAST/DAST en CI quand le dépôt est branché sur une forge.

Ce document complète **[TODO.md](./TODO.md)** (notes dev) et **[EVOLUTION-PLATEFORME.md](./EVOLUTION-PLATEFORME.md)** (infra). Les **décisions produit** et le périmètre sécurité par app sont dans **[ROADMAP.md](./ROADMAP.md)** (TR-01).
