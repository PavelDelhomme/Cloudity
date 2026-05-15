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
applicatif côté `/auth/security-paths/validate` (cf. § 2.3).

### 2.2 Sliding window

À la validation, on accepte **l'epoch courant ET l'epoch précédent**.
Conséquences :

* l'utilisateur qui ouvre les Settings tous les 25 j n'a jamais à re-fetcher
  le slug ;
* à J+30 mais < J+60 (epoch précédent) le slug reste valide ;
* à J+60 (epoch d'avant l'avant-dernier) le slug est rejeté → le SPA
  re-fetche `/auth/security-paths` (avec le **JWT Bearer déjà en session**)
  qui renvoie un slug frais — **aucune reconnexion** n'est requise ;
* **Protection contre les fuites passives à long terme** (historique
  navigateur, screenshot archivé, bookmark conservé des mois) : un slug
  capturé à J+0 mais **réexploité** à J+60 **sans** JWT valide ne fonctionne
  plus — la rotation par epoch limite la fenêtre où l'**URL seule** reste
  utilisable.
* **Limitation (attaquant actif)** : un adversaire qui dispose **dès J+0** du
  slug **et** d'un **JWT d'accès encore valide** peut exploiter la page
  sensible **immédiatement**. La rotation à J+60 **ne** protège **pas**
  contre cet usage instantané. La défense contre l'exploitation active reste
  la **durée courte** du jeton d'accès, la révocation / expiration de session,
  et le **rate-limit** sur `/auth/security-paths/validate` (cf. § 1).
* **Règle d'or** : un **slug seul** ne suffit **jamais** — l'accès aux pages
  sensibles repose toujours sur le **Bearer** + validation HMAC du slug.

**Périmètre** : ce slug ne protège que les **pages Settings sensibles** (2FA,
codes de récupération, passkeys). Les flux courants (**upload / download**
Drive et Photos, **mail** en rédaction, **notes**, etc.) n'utilisent **pas** ce
mécanisme : ils passent par le **JWT Bearer** standard sur les APIs — la
rotation du slug Settings **n'a aucun impact** sur ces opérations.

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
* **Pas de reconnexion** : quand le slug expire côté serveur, le SPA refetch
  `GET /auth/security-paths` avec le **Bearer existant** ; l'utilisateur ne
  voit en général rien (React Query). Dans le **pire cas**, un utilisateur qui
  reste longtemps sur une URL `/app/settings/sec/…` obsolète sans refetch
  anticipé peut voir une **micro-redirection** vers le chemin canonique le
  temps du refetch — ce n'est **pas** une déconnexion du compte.
* Re-fetch **proactif** à `rotates_at - 5 min` : `useSecurePaths` programme un
  `invalidateQueries` sur la clé `security-paths` (**UC-FE-01** livré) — en
  complément de `staleTime` 30 min.

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
* Frontend : `useSecurePaths` cache + repli 503,
  **re-fetch à `rotates_at - 5 min`** (**UC-FE-01** livré — `invalidateQueries`),
  `SecureSettingsPage` redirection si 403, hardening `<meta>` injecté ;
  **UC-QA-01** : Vitest **`src/security/ucQa01SlugIsolation.test.ts`** (api métier sans slug `/app/settings/sec/`) ; E2E/manuel au besoin.

---

## 7. Couverture mobile (apps Dart) — parité 2FA

> **Pourquoi une section dédiée ?** Les *capability URLs* sont
> intentionnellement **web only** (elles s'appliquent au routage SPA, donc
> au navigateur uniquement). Mais le **même niveau d'exigence** sur la
> 2FA doit s'appliquer aux apps mobiles, sans quoi un compte 2FA-activé
> serait inutilisable depuis le mobile — ou pire, l'utilisateur serait
> tenté de désactiver le 2FA pour rétablir l'accès, ce qui ruinerait
> l'effort de durcissement web.

### 7.1 Diagnostic initial

Avant ce sprint, les apps `mobile/drive`, `mobile/mail` et
`mobile/photos` (Flutter / Dart) renvoyaient simplement à l'utilisateur :

> *« Ce compte a la double authentification. Utilisez le web pour vous
> connecter, ou désactivez provisoirement le 2FA pour les tests
> mobiles. »*

→ Régression UX dès qu'on activait le 2FA. **Inacceptable** au regard du
durcissement web.

### 7.2 Solution livrée

Un module 2FA mutualisé `mobile/cloudity_shared/lib/auth_2fa.dart`
expose :

| Brique | Rôle |
|---|---|
| `LoginRequires2FAException` | Levée par `auth_api.login(...)` quand le serveur répond `{ "requires_2fa": true }`. Porte `email` + `tenantId` (jamais le mot de passe — l'étape 2 ne le requiert pas). |
| `Auth2FAClient.verify({email,tenantId,code})` | POST `/auth/2fa/verify` → `Auth2FAResult { accessToken, refreshToken, expiresIn, usedRecoveryCode, recoveryCodes }`. Erreurs typées `Auth2FAException`. |
| `looksLikeRecoveryCode(input)` | Heuristique alignée serveur (`recoverycodes.go`) : 12 caractères alphanumériques (avec ou sans tirets) → recovery code ; sinon TOTP. Permet à l'UI de pré-valider la saisie. |

Chaque app `drive` / `mail` / `photos` a été mise à jour :

* `auth_api.dart` : conversion `requires_2fa: true` → exception métier
  + nouvelle méthode `verify2FA(...)` qui délègue à `Auth2FAClient`.
* `login_screen.dart` : nouvelle vue d'étape 2 (`_build2FAForm`) avec
  champ « Code 2FA » — TOTP **ou** recovery code, détection automatique
  côté serveur. Le mot de passe est effacé du contrôleur dès la
  bascule, et le bouton « Annuler / changer de compte » réinitialise le
  flow proprement.

### 7.3 Tests

* **`mobile/cloudity_shared/test/auth_2fa_test.dart`** — `MockClient` :
  succès TOTP, succès avec recovery codes, 401 → exception lisible,
  saisie vide refusée *avant* appel réseau, 500 → exception, réponse
  sans `access_token` → exception. **11/11 verts** (`dart test`).
* `flutter analyze` — **0 issue** sur Drive / Mail / Photos /
  cloudity_shared.

### 7.4 Pourquoi pas de capability URL côté mobile ?

Les *capability URLs* ciblent un **routeur SPA web** (React Router) où
le risque est la fuite par `Referer`, screenshot d'URL ou historique
synchronisé. Sur Flutter mobile, ce vecteur **n'existe pas** :

* pas d'URL visible dans la barre d'adresse,
* pas de `Referer` HTTP,
* navigation interne par `Navigator.push(...)`, pas de routeur exposé,
* secret de session déjà confiné par `flutter_secure_storage` (Keystore
  Android / Keychain iOS).

L'app mobile reste sur des **endpoints canoniques** (`/auth/2fa/verify`,
`/auth/login`) et obtient son durcissement via la **même validation
serveur** que le web (TOTP + recovery codes + rate-limit). C'est un
choix conscient : on n'invente pas une protection sans menace
correspondante.

### 7.5 Ce qu'il reste à durcir (post-sprint Pass)

* **Conditional UI WebAuthn / Passkey mobile** : à étudier via
  `package:flutter_webauthn` ou plug-in `local_auth` + bridge backend.
* **Pinning TLS** : aucun pinning aujourd'hui ; à activer en prod via
  `http.Client` custom + `SecurityContext` pour les apps Drive / Mail /
  Photos / Pass.
* **Auto-clear clipboard** : déjà implémenté côté `mobile/pass`,
  pourrait être généralisé (ex. quand on copie un mail, on flush en
  60 s).

---

## 8. Références croisées

* Backend : [`securetoken_hmac.go`](../../backend/auth-service/securetoken_hmac.go) (HMAC / issue / verify) + [`securetoken_http.go`](../../backend/auth-service/securetoken_http.go) (handlers Gin).
* Frontend web : [`frontend/apps/cloudity-web/src/pages/app/settings/useSecurePaths.ts`](../../frontend/apps/cloudity-web/src/pages/app/settings/useSecurePaths.ts).
* Mobile (parité 2FA) : [`mobile/cloudity_shared/lib/auth_2fa.dart`](../../mobile/cloudity_shared/lib/auth_2fa.dart) + écrans login Drive / Mail / Photos.
* Migration partage : [`infrastructure/postgresql/migrations/39-pass-share-tokens.sql`](../../infrastructure/postgresql/migrations/39-pass-share-tokens.sql).
* Crypto Pass E2E : [`docs/securite/PASS-CRYPTO.md`](./PASS-CRYPTO.md).
* Cadre sécurité : [`docs/securite/SECURITE.md`](./SECURITE.md).
