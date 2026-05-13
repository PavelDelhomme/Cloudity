# Changelog — @cloudity/pass-crypto

Toutes les modifications notables de la lib TS `@cloudity/pass-crypto` sont consignées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage : [SemVer](https://semver.org/lang/fr/).

> **Statut** : `private: true` pendant le sprint Pass (échéance ~20 mai 2026). Publication conditionnelle à la stabilisation et à l'org npm cible (cf. **[../../../docs/decisions/multi-repo/REPONSES.md](../../../docs/decisions/multi-repo/REPONSES.md)** Q4=B).
>
> **Spécification** : **[../../../docs/securite/PASS-CRYPTO.md](../../../docs/securite/PASS-CRYPTO.md)** (référence d'implémentation, format `EnvelopeV1`).

## [0.1.0] — 2026-05-13 *(en cours, sprint Pass)*

Première implémentation TS du format **`EnvelopeV1`** (cf. PASS-CRYPTO.md § 2-4).

### Ajouté

- Primitives :
  - **Argon2id** via [`hash-wasm`](https://github.com/Daninet/hash-wasm) (paramètres profil device : `desktop` / `mobile-high` / `mobile-low`).
  - **XChaCha20-Poly1305** via [`@noble/ciphers/chacha`](https://github.com/paulmillr/noble-ciphers) (nonce 192 bits aléatoire).
  - **HKDF-SHA-256** via [`@noble/hashes/hkdf`](https://github.com/paulmillr/noble-hashes).
  - **CBOR** via [`cbor-x`](https://github.com/kriszyp/cbor-x) (encodage déterministe RFC 8949).
  - CSPRNG : `crypto.getRandomValues` (Web Crypto natif, jamais `Math.random`).
- Hiérarchie des clés `MK → VK → IK_item` (cf. PASS-CRYPTO § 3).
- Encodage `base64url` sans padding pour `pass_items.ciphertext` (compatible UTF-8 transport).
- Tests :
  - Round-trip chiffrement / déchiffrement (multi-paramètres KDF).
  - Anti-tampering : flip 1 bit dans `ct` / `wrap` / `aad` ⇒ erreur AEAD.
  - Vecteurs reproductibles (déterministe quand on fixe les nonces).

### Hors scope v0.1 (cf. PASS-CRYPTO § 9)

- KEM hybride **X25519 + ML-KEM-768** (champ `kem` réservé dans l'enveloppe mais non rempli).
- Signatures **Ed25519 + ML-DSA-65** (partage entre comptes — Phase v2).
- Recherche locale chiffrée (Phase v1.0).

---

*Format des entrées suivantes : `## [X.Y.Z] — YYYY-MM-DD` avec sections `Ajouté`, `Modifié`, `Déprécié`, `Retiré`, `Corrigé`, `Sécurité`.*
