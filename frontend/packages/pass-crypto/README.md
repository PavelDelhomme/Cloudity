# @cloudity/pass-crypto

Crypto client Cloudity Pass : **Argon2id + XChaCha20-Poly1305 + HKDF-SHA-256** + format `EnvelopeV1`.

> **Spec normative** : **[../../../docs/securite/PASS-CRYPTO.md](../../../docs/securite/PASS-CRYPTO.md)**.
> **Sprint** : **[../../../docs/produit/SPRINT-PASS-2026-05.md](../../../docs/produit/SPRINT-PASS-2026-05.md)**.

## Garanties zero-access

- Le serveur **ne déchiffre jamais** le contenu d'un item — il étiquette uniquement la `format_version`.
- Toutes les clés de chiffrement (MK, VK, IK_item) vivent **uniquement** en mémoire d'une session déverrouillée côté client.
- Le mot de passe maître **ne quitte pas l'appareil** : il est dérivé en MK via Argon2id puis effacé.

## API publique (cf. `src/index.ts`)

```ts
import {
  deriveMasterKey,        // mot de passe maître + salt → MK (32 bytes)
  deriveVaultKey,          // MK + vault_id → VK
  encryptItem,             // VK + item plaintext → ciphertext base64url
  decryptItem,             // VK + ciphertext → item plaintext
  generatePassword,        // générateur de mots de passe (longueur, alphabets)
  type Argon2idParams,
  type EnvelopeV1,
} from '@cloudity/pass-crypto'
```

## Profils Argon2id (cf. PASS-CRYPTO § 3.3)

| Profil | `t` | `m` (KiB) | `p` |
|--------|-----|-----------|-----|
| `desktop` | 4 | 262144 (256 MiB) | 4 |
| `mobile-high` | 3 | 131072 (128 MiB) | 2 |
| `mobile-low` | 3 | 65536 (64 MiB) | 2 |

## Tests

```sh
npm test -w @cloudity/pass-crypto
```

Couvre : round-trip multi-profils, anti-tampering AEAD (flip 1 bit ⇒ erreur), génération de mots de passe (entropie, alphabet).
