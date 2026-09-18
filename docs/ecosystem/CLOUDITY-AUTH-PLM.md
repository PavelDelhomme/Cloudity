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

### Phase 2 — Endpoint PLM « Lier Cloudity » (**fondation OK**, flag off)

Côté Cloudity `auth-service` (livré, défaut **404** si `CLOUDITY_SSO_ENABLED` off) :

- `POST /auth/identity/link` — body `{ app_id, external_user_id, email }` + Bearer Cloudity
- `GET /auth/identity/links` — liste des liens du user
- Migration `infrastructure/postgresql/migrations/50-identity-app-links.sql`

Côté `products/YTMusic` API (helper livré, no-op si flag off) :

1. User déjà connecté PLM (session locale).
2. Appeler `linkCloudityAccount()` (`api/src/auth/cloudityLink.ts`) avec Bearer Cloudity.
3. Vérifier email Cloudity == email PLM (côté auth-service).
4. Brancher au login / settings PLM **uniquement en préprod** quand on active le flag.

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
| `platform/identity-sdk/` | Types + client HTTP |
| `infrastructure/postgresql/migrations/50-identity-app-links.sql` | Table `identity_app_links` |
| `backend/auth-service/identity_link.go` | Routes link/list (flag `CLOUDITY_SSO_ENABLED`) |
| `products/YTMusic/api/src/auth/cloudityLink.ts` | Helper PLM opt-in (no-op si flag off) |

## Smoke (Cloudity-only, sans toucher PLM)

```bash
AUTH_BASE=http://127.0.0.1:6003 ./scripts/ops/sso-preprod-smoke.sh
# 404 = flag off (sûr) · 401 = flag on, Bearer requis
```

Préprod : mettre `CLOUDITY_SSO_ENABLED=1` dans `.env.preprod` / Portainer stack-dev **uniquement**, appliquer migration `50-identity-app-links.sql`, relancer auth-service. Ne pas activer en prod.

Branchement PLM / Gasoil : dans **leurs** repos, plus tard.
