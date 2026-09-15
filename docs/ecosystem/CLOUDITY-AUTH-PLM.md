# Cloudity Auth ↔ utilisateurs PLM / YTMusic

> Objectif : **un seul compte Cloudity ID** utilisable dans PLM (et plus tard Gasoil / JT), **sans casser** les logins locaux ni les volumes.

## État actuel (séparé)

| Système | Stockage users | Login |
|---------|----------------|-------|
| **Cloudity** `auth-service` | Postgres `cloudity_postgres_data` → table `users` (tenant + email) | JWT + refresh, 2FA, passkeys |
| **PLM / YTMusic** | SQLite/volume `ytmusic_ytmusic_data` → `users` (email, password_hash, google_id, …) | JWT local + passkeys + QR device |
| **GasoilTracking** | `gasoil_api_data` → users sync | JWT local |

Les emails peuvent déjà être **identiques** entre apps ; les comptes ne sont **pas liés**.

## Principes non négociables

1. **Opt-in** : le login PLM actuel reste le défaut tant que l’utilisateur n’a pas lié Cloudity ID.
2. **Zéro perte** : jamais de migration destructive du volume YTMusic ; pas de delete users.
3. **Lien par email vérifié** (ou OIDC), jamais par guess d’ID.
4. Feature flag `CLOUDITY_SSO_ENABLED` côté PLM API.

## Architecture cible (phases)

```
┌─────────────────┐     OIDC / token exchange      ┌──────────────────┐
│ cloudity-auth   │◄──────────────────────────────►│ PLM API          │
│ (IdP)           │   subject = cloudity user id   │ auth locale OK   │
└────────┬────────┘                                └────────┬─────────┘
         │                                                   │
         │              identity_links                       │
         │   cloudity_user_id ↔ plm_user_id ↔ email          │
         └──────────────────────┬────────────────────────────┘
                                │
                     platform/identity-sdk (clients)
```

### Phase 0 — Doc + SDK (cette itération)

- Ce document + `platform/identity-sdk` (types + client stub).
- Chemins products : `GasoilTracking/`, `YTMusic/`.

### Phase 1 — Table de lien (Cloudity)

Migration Postgres (sans toucher YTMusic) :

```sql
CREATE TABLE IF NOT EXISTS identity_app_links (
  id BIGSERIAL PRIMARY KEY,
  cloudity_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id VARCHAR(64) NOT NULL,          -- 'ytmusic' | 'gasoil' | 'jobbingtrack'
  external_user_id VARCHAR(128) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, external_user_id),
  UNIQUE (cloudity_user_id, app_id)
);
```

### Phase 2 — Endpoint PLM « Lier Cloudity »

Côté `products/YTMusic` API (flag off par défaut) :

1. User déjà connecté PLM (session locale).
2. `POST /api/auth/cloudity/link` avec Bearer Cloudity (ou code OAuth).
3. Vérifier email Cloudity == email PLM (ou email_verified des deux côtés).
4. Persister `users.cloudity_subject` (colonne additive) + enregistrer le lien côté Cloudity si API dispo.

### Phase 3 — Login « Continuer avec Cloudity »

- Bouton opt-in sur l’écran login PLM.
- Échange code → session PLM **sans** écraser password_hash local.
- Si pas de lien : proposer création de lien ou compte Cloudity.

### Phase 4 — Gasoil / JT

Même schéma `app_id`, même SDK. Auth locale reste filet hors-ligne.

## Ce qu’on ne fait pas maintenant

- Fusion forcée des bases users.
- Remplacer le password PLM par Cloudity uniquement.
- Partager les JWT entre domaines sans audience / issuer distincts.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `platform/identity-sdk/` | Types + client HTTP stub |
| `infrastructure/postgresql/migrations/` | Future `NN-identity-app-links.sql` |
| `products/YTMusic/api/src/auth/` | Future `cloudityLink.ts` (phase 2) |
| `backend/auth-service/` | Future routes OIDC / link token |

## Smoke (quand phase 2+)

1. Compte PLM existant + même email Cloudity.
2. Flag ON en **préprod uniquement**.
3. Lier → déconnecter → « Continuer avec Cloudity » → même bibliothèque / prefs.
4. Flag OFF → login local inchangé.
