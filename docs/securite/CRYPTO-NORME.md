# Cloudity — Norme cryptographique (référentiel actionnable)

**Rôle** : extraire de **[SECURITE.md](SECURITE.md)** § 8 la liste **actionnable** des algos **autorisés** / **interdits** et les **paramètres exacts** à appliquer dans le code, avec la roadmap de migration.

> Principe directeur : **« le maximum en chiffrement, sans vieilleries inefficaces »**. Crypto post-quantique en hybride (X25519 ⊕ ML-KEM, Ed25519 → ML-DSA). AEAD obligatoire, KDF coûteuse mémoire, constantes-time partout, TLS 1.3 only.

---

## 1. Whitelist — algos **autorisés** (Cloudity 2026)

### 1.1 Symétrique (chiffrement de données + canaux)

| Usage | Algo | Notes |
|-------|------|-------|
| **AEAD** général | **AES-256-GCM** | accélération AES-NI / ARMv8 Crypto ; nonce 96 bits aléatoire ou compteur unique |
| **AEAD** alternatif | **ChaCha20-Poly1305** | préféré sur ARM sans AES-NI ; obligatoire en complément si déploiement sur RPi / mobile |
| **AEAD** longue durée | **XChaCha20-Poly1305** | nonce 192 bits (idéal pour stockage E2EE / fichiers — pas de risque de répétition) |
| Streaming volume / fichiers | **AES-256-GCM** par chunk (≤ 4 MiB / chunk) **ou** **AES-256-GCM-SIV** (resist. nonce reuse) | imposé par § 1.4 ci-dessous |

### 1.2 Hash & MAC

| Usage | Algo | Notes |
|-------|------|-------|
| Hash général | **SHA-256** | minimum, ou **SHA-3-256** / **BLAKE2s-256** / **BLAKE3-256** |
| Hash longue durée | **SHA-512** ou **BLAKE3-512** | preuves d'intégrité, archives, fingerprints publics |
| MAC | **HMAC-SHA-256** | ou **BLAKE2s-MAC** — toujours **constants-time** côté vérification |
| Refresh tokens (server-side) | **SHA-256(token aléa CSPRNG 256 bits)** | jamais en clair côté Redis ✓ déjà fait dans `auth-service` |

### 1.3 Asymétrique classique

| Usage | Algo | Taille | Notes |
|-------|------|--------|-------|
| Signature **JWT** & service-to-service | **EdDSA (Ed25519)** | sk 32 B, pk 32 B, sig 64 B | **cible — migration RS256 en cours** (cf. § 5) |
| Signature **certificats** mTLS | **EdDSA (Ed25519)** ou **ECDSA P-256** | idem / 64 B sig | step-ca configurable |
| Échange de clés (KEM) classique | **X25519** | 32 B | wireguard kernel + TLS 1.3 |
| Anti-PQ harvest-and-decrypt | **X25519 + ML-KEM-768 hybride** | (cf. § 1.5) | TLS 1.3 hybride dispo dans Caddy 2.8+ / nginx + OpenSSL 3.5 |

### 1.4 KDF (key derivation function)

| Usage | Algo | Paramètres minimum Cloudity |
|-------|------|------------------------------|
| **Mots de passe** (auth) | **Argon2id** | **m=64 MiB, t=3, p=4** (cf. § 3) |
| **Vault Pass** (E2EE client) | **Argon2id** | **m=128 MiB, t=4, p=4** (côté navigateur, plus généreux) |
| Dérivation de clé symétrique depuis un secret | **HKDF-SHA-256** | ou **HKDF-SHA-512** pour clés > 256 bits |
| Dérivation depuis échange ECDH | **HKDF-SHA-256(shared_secret \|\| context)** | jamais utiliser le shared_secret brut comme clé |

### 1.5 Post-quantique (hybride dès activation)

| Usage | Algo classique | Algo PQ | Combinaison |
|-------|----------------|---------|-------------|
| **TLS 1.3 KEM** (browser ↔ gateway) | X25519 | **ML-KEM-768** (FIPS 203) | `X25519MLKEM768` (codepoint IANA 0x11ec) |
| **Vault E2EE** envelope | X25519 | **ML-KEM-768** | `wrap_key = HKDF(X25519 ⊕ ML-KEM)` |
| **Signatures longues durées** (root CA, archives) | Ed25519 | **ML-DSA-65** (FIPS 204) | concat / hybride à signer en parallèle |
| **Signatures TOFU rares** | Ed25519 | **SLH-DSA-128s** (FIPS 205) | racine de confiance offline |

### 1.6 TLS

| Couche | Version min | Courbes | CipherSuites |
|--------|-------------|---------|--------------|
| **TLS public** (gateway ↔ navigateur) | **TLS 1.3** | X25519 (priorité 1), secp256r1 (fallback) ; **X25519MLKEM768** dès dispo | TLS 1.3 ne configure pas les ciphers (TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256, TLS_AES_128_GCM_SHA256) |
| **mTLS interne** (service ↔ service) | **TLS 1.3** | X25519 (priorité 1), secp256r1 (fallback) | idem TLS 1.3 only |
| **Reverse-proxy → gateway** | **TLS 1.3** | idem | idem |

### 1.7 Aléa & nonces

| Usage | Source |
|-------|--------|
| Tokens, secrets, sels | `crypto/rand` (Go) / `crypto.getRandomValues` (browser) / `secrets` module (Python) |
| **Jamais** | `math/rand`, `Math.random`, `random.random` — **interdits absolus** |
| Nonces AEAD | aléatoire 96 bits OU compteur unique (jamais répété pour une même clé) |
| Nonces XChaCha20 | aléatoire 192 bits (sûr de ne jamais répéter) |

### 1.8 WireGuard (homelab + futur backup offsite)

| Composant | Algo |
|-----------|------|
| ECDH | Curve25519 |
| AEAD | ChaCha20-Poly1305 |
| Hash | BLAKE2s |
| KDF | HKDF-BLAKE2s |
| **PSK** (couche post-quantum lite) | **obligatoire** — généré via `wg genpsk`, distribué hors-bande |

---

## 2. Blacklist — algos & pratiques **interdits**

> Tout code Cloudity qui contient un de ces éléments est un **bug critique** à corriger immédiatement.

| Catégorie | Interdit | Pourquoi |
|-----------|----------|----------|
| **Hash** | **MD5**, **SHA-0**, **SHA-1** (sauf HMAC-SHA1 dans TOTP RFC 6238 — toléré) | collisions trouvées, cryptographiquement cassés |
| **Symétrique** | **DES**, **3DES**, **RC4**, **Blowfish** | obsolètes ; AES-CBC sans HMAC (interdit : seulement AES-CBC-HMAC ou mieux AEAD) |
| **AEAD avec nonce non unique** | tout réuse de `(key, nonce)` en GCM | catastrophe immédiate (récupération de la clé d'authentification) |
| **Asymétrique** | **RSA-1024**, **DH < 2048 bits**, **secp192r1**, **secp224r1**, courbes < 256 bits | trop courtes |
| **JWT** | **HS256** (HMAC) côté multi-service, **RS256 < 2048 bits**, **none** algo | risque de leak de la clé partagée / forgerie ; `alg:none` est un bug légendaire |
| **TLS** | TLS 1.0, TLS 1.1, TLS 1.2 (sauf clients legacy temporaires) | TLS 1.2 acceptable transitoirement, **jamais** par défaut |
| **CipherSuites TLS 1.2** (si vraiment requis) | tout cipher non AEAD (CBC, RC4, NULL) | malleabilité, padding oracles |
| **KDF** | **PBKDF2** (sauf legacy ; s'aligner sur Argon2id) | CPU-only, vulnérable aux GPU/ASIC modernes |
| **Hashing mots de passe** | **MD5**, **SHA-1**, **SHA-256 brut**, **bcrypt < 10 rounds** | bcrypt ≥ 12 rounds toléré uniquement en lecture (rétrocompat ancien hash) |
| **Aléa** | `math/rand` Go, `Math.random` JS, `random` Python | non cryptographique, prédictible |
| **Compression avant chiffrement** | toute compression (gzip/brotli/zstd) **avant** TLS sur du contenu mêlé secret + entrée user | CRIME / BREACH side-channels |
| **Débogage** | logs contenant tokens / secrets / mots de passe / hashs en clair | leakage trivial |

---

## 3. Argon2id — paramètres exacts (auth-service)

### 3.1 Profil **standard** (CPU serveur ≥ 2 cores)

```go
import "github.com/alexedwards/argon2id"

var hardenedParams = &argon2id.Params{
    Memory:      64 * 1024, // 64 MiB
    Iterations:  3,
    Parallelism: 4,
    SaltLength:  16,
    KeyLength:   32,
}
```

Coût attendu : ~150–250 ms par hash sur un VPS 2 vCPU récent. Multiplie par ~6× le coût de `argon2id.DefaultParams` (m=64, t=1, p=2) → renforce la résistance brute-force GPU/ASIC sans impacter sensiblement l'UX login (avec rate-limit `/auth/login` en place : pas de problème de DoS auth-side).

### 3.2 Profil **Vault Pass E2EE** (côté navigateur)

Plus généreux car calcul côté **client** (navigateur du user, pas serveur) :

```js
{ memory: 128 * 1024, iterations: 4, parallelism: 4, hashLength: 32, saltLength: 16 }
```

Coût attendu : ~500–800 ms côté navigateur moderne. Une seule fois au déverrouillage du coffre.

### 3.3 Override par environnement

Le code doit accepter un override par variables d'environnement (`ARGON2_MEMORY_KB`, `ARGON2_TIME`, `ARGON2_PARALLELISM`) pour ajuster sans recompiler. Le **CHANGELOG d'auth-service** trace tout changement de paramètres.

### 3.4 Recalibrage tous les 18–24 mois

Convention : OWASP cheat sheet d'Argon2id est revu tous les 18–24 mois (matériel évolue). Tâche récurrente dans **BACKLOG.md** § « Sécurité & infra ».

---

## 4. TLS — configuration explicite (Go `tls.Config`)

### 4.1 `internalsec` (mTLS interne)

```go
tlsCfg := &tls.Config{
    MinVersion:       tls.VersionTLS13, // déjà en place ✓
    CurvePreferences: []tls.CurveID{tls.X25519, tls.CurveP256}, // À AJOUTER (X25519 first)
    // CipherSuites: pas configurable en TLS 1.3 only — Go choisit automatiquement
    //   parmi TLS_AES_256_GCM_SHA384 / TLS_AES_128_GCM_SHA256 / TLS_CHACHA20_POLY1305_SHA256.
    // ClientCAs / ClientAuth / GetCertificate : déjà gérés ✓
}
```

### 4.2 Reverse-proxy public (nginx-proxy-manager / Caddy)

Documenté dans **[REVERSE-PROXY.md](REVERSE-PROXY.md)** :

- TLS 1.3 only (`ssl_protocols TLSv1.3;` côté nginx).
- Courbes : `X25519:secp256r1`.
- HSTS : `max-age=63072000; includeSubDomains; preload`.
- OCSP stapling activé.
- **Hybride PQ** : activer `X25519MLKEM768` dès que la version d'OpenSSL/BoringSSL le supporte côté reverse-proxy (Caddy 2.8+ ✅, nginx + OpenSSL 3.5+ ✅, NPM + Caddy backend OK).

---

## 5. JWT — migration RS256 → EdDSA (Ed25519)

### 5.1 État actuel

`auth-service` signe en **RS256** (RSA-2048 PKCS1-v1_5) :

- Signatures de **256 octets** (RSA-2048).
- Vérification ~10× plus lente que Ed25519 sur la plupart des CPU.
- API `golang-jwt` supporte EdDSA depuis v4 (déjà installé).

### 5.2 Plan de migration progressif (sans casser les sessions existantes)

```
Phase A — Préparation (sans impact runtime)
  1. Générer une paire Ed25519 (clé privée auth-service, clé publique exposée
     en plus côté gateway).
  2. Publier les DEUX clés publiques côté gateway via JWKS
     (/.well-known/jwks.json) : kid="rs256-1" + kid="ed25519-1".
  3. Déployer.

Phase B — Activation EdDSA pour les NOUVEAUX tokens
  1. auth-service signe les nouveaux access tokens en EdDSA (kid="ed25519-1").
  2. Les anciens tokens RS256 (kid="rs256-1") restent valides jusqu'à expiration
     (15 min pour l'access token, 7-30j pour le refresh).
  3. gateway accepte les deux kid pendant la fenêtre de transition.

Phase C — Décommissionnement RS256
  1. Après 30 jours sans token RS256 émis (suffit l'expiration des refresh),
     retirer la clé RSA du JWKS.
  2. auth-service ne charge plus la paire RSA au boot.
  3. Supprimer la dépendance bcrypt si plus aucun hash bcrypt dans la base
     (vérifier via SELECT COUNT(*) FROM users WHERE password_hash NOT LIKE '$argon2id$%').
```

### 5.3 Code cible (extrait, à appliquer en phase B)

```go
import (
    "crypto/ed25519"
    "github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
    // ...
    edPrivateKey ed25519.PrivateKey
    edPublicKey  ed25519.PublicKey
}

func (a *AuthService) generateAccessToken(...) (string, error) {
    claims := Claims{ /* ... */ }
    token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
    token.Header["kid"] = "ed25519-1"
    return token.SignedString(a.edPrivateKey)
}
```

### 5.4 Comparaison perf (mesures indicatives, x86_64)

| Algo | Sign (op/s) | Verify (op/s) | Sig size | Pub key size |
|------|-------------|---------------|----------|--------------|
| RSA-2048 RS256 | ~1 800 | ~62 000 | 256 B | 270 B |
| **Ed25519** | **~24 000** | **~10 000** | **64 B** | **32 B** |
| ECDSA P-256 | ~28 000 | ~9 500 | ~71 B | 64 B |
| ML-DSA-65 (PQ cible) | ~5 000 | ~14 000 | ~3 300 B | ~1 950 B |

Ed25519 = **gain net** sur Cloudity (plus rapide à signer côté serveur, signatures plus petites pour bandwidth + storage Redis pour les sessions).

---

## 6. Performance — sans compromis sécurité

### 6.1 Transport HTTP

| Couche | Cible |
|--------|-------|
| Browser ↔ reverse-proxy | **HTTP/2** obligatoire (multiplexing TLS) ; **HTTP/3 (QUIC)** dès Caddy 2.6+ / nginx 1.25+ |
| Reverse-proxy ↔ gateway | **HTTP/2 cleartext (h2c)** ou TLS 1.3 + HTTP/2 ; **PAS** HTTP/1.1 keep-alive (latence) |
| gateway ↔ services | HTTP/2 forcé via `ForceAttemptHTTP2: true` (déjà en place dans `internalsec.InternalHTTPClient`) ✓ |

### 6.2 Compression

- **Brotli** (niveau 5) sur les **statiques** (HTML, CSS, JS) côté reverse-proxy.
- **gzip** fallback pour les vieux clients.
- **Pas de compression** sur les réponses API JSON contenant un mélange de **secrets + données utilisateur** (CRIME / BREACH).

### 6.3 Connexions DB & cache

- PostgreSQL : connexions épinglées par requête (cf. `pkg/dbpin`) ✓.
- Redis : connexions persistantes via go-redis pool ✓.
- Préférer **prepared statements** (Go `db.PrepareContext`) pour les hot-paths (login, list).

### 6.4 Limites système

- `ulimit -n` ≥ 65 536 sur tous les conteneurs en prod.
- TCP keep-alive 30 s côté serveur HTTP.
- Timeout strict sur les appels inter-services : 5 s déjà dans `internalsec.InternalHTTPClient` ✓.

---

## 7. Application — checklist code review

À cocher pour tout PR qui touche à la crypto / auth / TLS :

- [ ] Tout nouvel algo est dans la **whitelist § 1**.
- [ ] Aucun élément de la **blacklist § 2** introduit.
- [ ] Aléa exclusivement via **CSPRNG** (`crypto/rand`).
- [ ] Comparaisons de secrets en **constants-time** (`crypto/subtle.ConstantTimeCompare` Go).
- [ ] Nonces AEAD jamais réutilisés (counter ou aléatoire 96+ bits).
- [ ] KDF avec params § 3 (Argon2id m≥64MB t≥3 p≥4 pour les passwords).
- [ ] TLS 1.3 only avec `CurvePreferences` X25519 first.
- [ ] Pas de log de tokens / secrets / hashs / clés.
- [ ] CHANGELOG mis à jour (§ Sécurité) si l'API crypto change.

---

## 8. Outils & vérifications

### 8.1 Audit interne

| Outil | Rôle | Usage |
|-------|------|-------|
| `govulncheck` | CVE Go | déjà intégré dans **`make test-security`** ✓ |
| `gosec` | Patterns dangereux Go | à ajouter en CI |
| `npm audit` | CVE npm | à étendre à tous les workspaces |
| `dart pub outdated` | CVE Dart | manuel pour l'instant |
| Bibliothèques crypto auditées | éviter les rolled-out home-made | jamais de crypto custom |

### 8.2 Audit externe (futur)

- Scan TLS public via [SSL Labs](https://www.ssllabs.com/ssltest/) → cible **A+**.
- [Mozilla Observatory](https://observatory.mozilla.org/) → cible **A+**.
- Test post-quantique : [pq.cloudflareresearch.com](https://pq.cloudflareresearch.com/) côté browser.

---

## 9. Statut Cloudity 2026-05-12

| Brique | État | Action |
|--------|------|--------|
| **TLS 1.3 only mTLS interne** | ✅ `internalsec.go` `MinVersion: tls.VersionTLS13` | Ajouter `CurvePreferences` X25519 first (cette PR) |
| **Argon2id passwords** | ✅ `auth-service` `argon2id.DefaultParams` (m=64, t=1, p=2) | **Renforcer** : m=64, t=3, p=4 (cette PR) |
| **bcrypt fallback** | ✅ migration au login si hash bcrypt | maintenir jusqu'à `COUNT(...) bcrypt = 0` |
| **AES-256-GCM** | ✅ `mail-directory-service` (chiffrement aliases) | OK |
| **JWT EdDSA (Ed25519)** | ✅ **Phase B active depuis 2026-05-12** — `auth-service` signe en EdDSA + `api-gateway` accepte EdDSA et RS256 (kid-aware) | Phase C : décommissionnement RS256 après 30j (≥ 2026-06-12) — supprimer la paire RSA et `jwt.SigningMethodRSA` côté parseAccessToken |
| **TOTP (HMAC-SHA1)** | ✅ acceptable (RFC 6238) | Préparer **WebAuthn / passkeys** comme 2ᵉ facteur préféré |
| **Hybride post-quantique TLS public** | 📅 cible | activer `X25519MLKEM768` côté reverse-proxy en prod |
| **Hybride post-quantique JWT** | 📅 cible long terme | attendre `golang-jwt` ML-DSA stable + clients suiveurs |
| **HTTP/3 (QUIC)** | 📅 cible | activer côté reverse-proxy en prod (gain mobile / mauvais réseau) |
| **Brotli statiques** | 📅 cible | activer en reverse-proxy |

---

## 10. Références

- [SECURITE.md § 8](SECURITE.md) — vision post-quantique Cloudity.
- [MTLS-INTERNE.md](MTLS-INTERNE.md) — déploiement step-ca, mTLS off → permissive → strict.
- [REVERSE-PROXY.md](REVERSE-PROXY.md) — config TLS public.
- [PASS-CRYPTO.md](PASS-CRYPTO.md) — format `EnvelopeV1` Vault Pass (Argon2id + XChaCha20-Poly1305 + KEM hybride).
- [OWASP Cheat Sheet — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) (référence Argon2id).
- [NIST FIPS 203 / 204 / 205](https://csrc.nist.gov/publications/detail/fips/203/final) — ML-KEM / ML-DSA / SLH-DSA.
- [IANA TLS Parameters](https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml) — codepoint `X25519MLKEM768 = 0x11ec`.

---

*Référentiel évolutif. Mise à jour obligatoire à chaque ajout d'algo en whitelist / blacklist ou changement de params § 3 / § 4.*
