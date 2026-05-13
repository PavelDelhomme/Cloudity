# URL Capabilities — Tokens d'URL chez Cloudity

> **TL;DR** — On distingue deux familles d'URLs sécurisées chez Cloudity :
>
> 1. **Capability URLs rotatives** pour ce que l'utilisateur consulte
>    **lui-même** (réglages 2FA, codes de récupération, passkeys) →
>    slug HMAC dérivé de `(user_id, purpose, epoch 30 j)`. Auto-rotation,
>    pas de stockage DB.
> 2. **Tokens de partage stables** pour ce que l'utilisateur **partage à
>    autrui** (item Pass partagé) → 192 bits aléatoires, hashés SHA-256
>    en base, révocables, optionnellement expirables.
>
> **Règle d'or** : on ne fait jamais l'inverse. Un token de partage qui
> rotate casse l'utilisateur (le lien qu'il a envoyé ne marche plus) ; un
> slug d'auto-service stable laisse durer indéfiniment l'effet d'une
> fuite par capture d'écran / historique navigateur.

---

## 1. Threat model — pourquoi ces deux modèles ?

Une URL canonique stable (`/app/settings/security`) est protégée par le
JWT en `Authorization: Bearer …` ; sans le token, accès refusé. **Le
risque n'est pas l'accès direct** mais la **fuite contextuelle** :

* **Referer** vers un site tiers (`<a href="https://lien-externe">`),
* **screenshot** envoyé à un proche pour faire du support,
* **historique navigateur** synchronisé sur plusieurs appareils,
* **cache** disque de l'OS / proxy d'entreprise,
* **partage d'écran** en réunion (slack, zoom, …),
* **bookmark** réutilisé par un membre de la famille.

L'URL en elle-même n'est pas un secret cryptographique, mais sa
prévisibilité (`/app/settings/2fa/recovery-codes`) **simplifie** la vie
de l'attaquant qui sait quoi cibler une fois qu'il a un cookie de
session. On ajoute donc une couche d'**imprévisibilité** + **rotation**
en défense en profondeur.

---

## 2. Capability URLs rotatives (auto-service)

### 2.1 Format

```
/app/settings/sec/<epoch>.<base64url(hmac16)>
```

* `epoch` = `floor(now_ns / window_ns)` avec `window_ns = 30 jours`.
* `hmac16` = 16 premiers octets de
  `HMAC-SHA-256(URL_TOKEN_SECRET, "v1:" || user_id || ":" || purpose || ":" || epoch)`.
* Le préfixe `"v1:"` autorise un bump format sans casser silencieusement
  les tokens en vol.

Le HMAC tronqué à **128 bits** est suffisant : l'attaquant doit déjà
connaître `user_id` (qu'il peut sortir d'une enum), donc il ne lui reste
qu'à brute-forcer le HMAC, ce qui est trivialement bloqué par le rate-limit
applicatif côté `/auth/security-paths/validate` (cf. § 2.4).

### 2.2 Sliding window

À la validation, on accepte **l'epoch courant ET l'epoch précédent**.
Conséquences :

* l'utilisateur qui ouvre les Settings tous les 25 j n'a jamais à re-fetcher
  le slug ;
* à J+30 mais < J+60 (epoch précédent) le slug reste valide ;
* à J+60 (epoch d'avant l'avant-dernier) le slug est rejeté → le SPA
  re-fetche `/auth/security-paths` qui renvoie un slug frais ;
* un slug volé à J+0 ne sert plus à rien à J+60 même avec un JWT volé.

### 2.3 Endpoints

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET`  | `/auth/security-paths` | Bearer | Renvoie `{ paths: { settings_security: { path, token, expires_at, rotates_at } } }`. Cache `no-store`, `Referrer-Policy: no-referrer`. |
| `POST` | `/auth/security-paths/validate` | Bearer | Body `{ token, purpose }`. 200 si valide, 403 sinon. |

### 2.4 Côté frontend (`useSecurePaths`)

* React Query, `staleTime = 30 min`, `gcTime = 60 min`.
* Slug **jamais persisté** (pas de `localStorage`, pas de `sessionStorage`).
* Repli silencieux si 503 (`URL_TOKEN_SECRET` absent côté serveur) →
  redirige vers `/app/settings/canonical` pour ne pas bloquer l'UX.
* Re-fetch programmé à `rotates_at - 5 min` (TODO ROADMAP — actuellement
  on attend l'invalidation par `staleTime`).

### 2.5 Configuration serveur

| Variable | Type | Défaut | Description |
|---|---|---|---|
| `URL_TOKEN_SECRET` | `bytes >= 32` | `JWT_SECRET` (dérivé) | Clé HMAC. Recommandé en prod : `openssl rand -base64 48`. |
| `JWT_SECRET` | `string` | (requis) | Fallback automatique si `URL_TOKEN_SECRET` absent — dérivation `SHA-256("cloudity-url-tokens-v1:" || JWT_SECRET)`. Évite une variable supplémentaire à câbler dans tous les `.env` / Portainer Stack Variables. |

**Mode dégradé** : ni `URL_TOKEN_SECRET` ni `JWT_SECRET` → `GET
/auth/security-paths` renvoie `503` ; le SPA continue à fonctionner sur
les chemins canoniques (`/app/settings/canonical`).

---

## 3. Tokens de partage stables

### 3.1 Pourquoi stables ?

L'utilisateur Bob partage un mot de passe Wi-Fi à Alice via un lien
Cloudity. Si le token rotate tous les 30 j :

* **Mauvaise UX** : Alice doit ré-importer le lien à chaque rotation,
* **Anti-pattern de partage** : un lien dont l'identité change n'est plus
  un lien — c'est une session.

On préfère donc un **token aléatoire** (192 bits) **stable** mais
**révocable**. La révocation est **explicite** (Bob clique « révoquer »)
ou **automatique** (`expires_at` configuré à la création).

### 3.2 Schéma DB (`migrations/39-pass-share-tokens.sql`)

```sql
CREATE TABLE pass_share_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 hex du token brut
    vault_id INTEGER NOT NULL REFERENCES pass_vaults(id) ON DELETE CASCADE,
    item_id  INTEGER     NULL REFERENCES pass_items(id)  ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    use_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ
);
```

Le **token brut** (24 octets base64url, ~33 caractères) n'est **jamais**
stocké en clair. On ne garde que son hash SHA-256. En cas de dump de la
base, un attaquant ne peut pas reconstruire les tokens (résistance
préimage de SHA-256).

### 3.3 Crypto E2E **inchangée**

Le contenu de l'item partagé reste **chiffré** côté client par la même
hiérarchie `MK → VK → IK_item` (cf. `docs/securite/PASS-CRYPTO.md`). Le
token de partage donne accès au **ciphertext** ; le destinataire reçoit
en plus la `IK_item` re-chiffrée pour son `MK_destinataire` via la phase
KEM hybride (X25519 ⊕ ML-KEM-768) — **prévue Phase v0.2** (ROADMAP).

En attendant cette phase, le partage est **réservé à un destinataire
Cloudity** (qui partage déjà son MK via la session) ou doit passer par un
mécanisme de **dérivation à mot de passe** (`PBKDF2` du token →
sous-clé). Statut : ce mécanisme reste à concevoir, raison pour laquelle
seul le squelette infra est livré aujourd'hui (UI + endpoints en L2/L3).

### 3.4 Endpoints prévus (skeleton, non livrés à ce sprint)

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `POST`   | `/pass/shares` | Bearer | Crée un partage : `{ vault_id, item_id?, expires_at? }`, renvoie `{ token, url }` UNE fois. |
| `GET`    | `/pass/shares` | Bearer | Liste mes partages actifs. |
| `DELETE` | `/pass/shares/:id` | Bearer | Révoque (`revoked_at = now()`). |
| `GET`    | `/pass/share/:token` | **Public** | Sert le ciphertext (+ métadonnées non-sensibles) ; rate-limit strict ; incrémente `use_count`. |

---

## 4. Defense-in-depth complémentaire

Quel que soit le modèle, on impose côté serveur sur les routes sensibles :

* `Cache-Control: no-store, no-cache, must-revalidate` ;
* `Pragma: no-cache` ;
* `Referrer-Policy: no-referrer` ;
* CSP `default-src 'self'` (déjà global, cf. NPM Advanced).

Côté SPA, `SecureSettingsPage` injecte un `<meta name="referrer"
content="no-referrer">` pendant le montage pour bloquer les fuites par
`Referer` quand l'utilisateur clique vers un site externe.

---

## 5. Matrice de mode dégradé

| Cas | `URL_TOKEN_SECRET` | `JWT_SECRET` | Résultat | UX |
|---|---|---|---|---|
| Prod recommandé | défini (32+ oct) | défini | rotation 30 j | ✅ |
| Prod minimal | absent | défini | rotation 30 j (HMAC dérivé) | ✅ |
| Mauvaise conf | absent | absent | `503` sur `/auth/security-paths` | repli `/app/settings/canonical` (pas de slug) |
| Bug serveur (5xx) | n/a | n/a | repli SPA `/app/settings/canonical` | ✅ |

---

## 6. Tests

* Backend `securetoken_test.go` : génération, vérification user/purpose
  mismatch, fenêtre coulissante, tokens malformés, repli `JWT_SECRET`,
  fail-closed sans secret. **9/9 verts** (`go test ./...`).
* Frontend (TODO Vitest) : `useSecurePaths` cache + repli 503,
  `SecureSettingsPage` redirection si 403, hardening `<meta>` injecté.

---

## 7. Références croisées

* Backend : [`backend/auth-service/securetoken.go`](../../backend/auth-service/securetoken.go).
* Frontend : [`frontend/apps/cloudity-web/src/pages/app/settings/useSecurePaths.ts`](../../frontend/apps/cloudity-web/src/pages/app/settings/useSecurePaths.ts).
* Migration partage : [`infrastructure/postgresql/migrations/39-pass-share-tokens.sql`](../../infrastructure/postgresql/migrations/39-pass-share-tokens.sql).
* Crypto Pass E2E : [`docs/securite/PASS-CRYPTO.md`](./PASS-CRYPTO.md).
* Cadre sécurité : [`docs/securite/SECURITE.md`](./SECURITE.md).
