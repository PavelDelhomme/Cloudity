/**
 * Vecteurs déterministes — protège la stabilité du format `EnvelopeV1` dans le temps.
 *
 * **Pourquoi ces tests sont critiques** :
 * Si un upgrade de `hash-wasm` / `@noble/ciphers` / `cbor-x` change la sortie
 * d'Argon2id ou la sérialisation CBOR, **tous les coffres existants devenir
 * illisibles** sans qu'on s'en rende compte avant de réessayer un déverrouillage.
 *
 * Ces tests utilisent un RNG **déterministe** (xorshift32, jamais utilisé en prod —
 * cf. `_helpers.ts`) et des entrées fixes (mot de passe, salt, vault_id, item_id).
 * Les sorties attendues sont calculées **une fois** et figées en hex / base64url ;
 * toute régression future fera échouer le test.
 *
 * **Mise à jour des vecteurs** : si on change volontairement le format (bump
 * `EnvelopeV1` → `v: 2`), il faut régénérer les vecteurs et **bump la version
 * majeure** du package (cf. `CHANGELOG.md` semver).
 */

import { describe, expect, it } from 'vitest'
import { deriveMasterKey } from '../argon2'
import { deriveVaultKey } from '../hkdf'
import {
  buildEnvelope,
  decodeEnvelope,
  decryptItemFromVault,
  encodeEnvelope,
  openEnvelope,
} from '../envelope'
import { fromBase64Url, toBase64Url } from '../base64url'
import type { ItemPlaintextV1, KdfDescriptor } from '../types'
import { ARGON2ID_TEST, makeFixedRng } from './_helpers'

// --- Entrées canoniques (figées) ----------------------------------------

const MASTER_PASSWORD = 'cloudity-vector-master-2026'
const SALT_USER = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
])
const VAULT_ID = '00000000-0000-4000-8000-000000000001'
const ITEM_ID = '00000000-0000-4000-8000-000000000002'
const RNG_SEED = 0xdead_c0de

const KDF_FIELD: KdfDescriptor = {
  name: 'argon2id',
  t: ARGON2ID_TEST.t,
  m: ARGON2ID_TEST.m,
  p: ARGON2ID_TEST.p,
}

const ITEM_PLAINTEXT: ItemPlaintextV1 = {
  schema: 1,
  type: 'login',
  fields: {
    title: 'Vector test',
    url: 'https://example.org/login',
    username: 'vector@example.org',
    password: 'vector-fixed-password',
  },
  notes: 'Vecteur stable — ne pas modifier sans bump v: 2.',
  tags: ['vector'],
}

// --- Sorties attendues (calculées une fois, hard-codées) ----------------
//
// Pour régénérer ces valeurs après un changement INTENTIONNEL de format
// (bump v: 2), commenter le bloc `expect(...).toBe(...)` correspondant,
// relancer le test, copier la valeur affichée par le `console.log`, et
// remettre le `expect`.

/** Master key Argon2id pour MASTER_PASSWORD + SALT_USER + ARGON2ID_TEST (32 octets, hex). */
const EXPECTED_MK_HEX =
  '46d34f0b75afe0056348aef427b1082bf246a4a216c12fa1ca66086f8440a917'

/** Vault key HKDF-SHA-256 dérivée de MK + VAULT_ID (32 octets, hex). */
const EXPECTED_VK_HEX =
  'bef6308f2247fa485ffb1845da1293fc0d5ed80aba4882d173bcdce7454d7230'

/**
 * Enveloppe encodée (CBOR + base64url sans padding) pour le couple
 * (MASTER_PASSWORD, SALT_USER, VAULT_ID, ITEM_ID, ITEM_PLAINTEXT) avec un
 * RNG xorshift32 seedé à 0xdeadc0de.
 *
 * **Si cette valeur change**, c'est qu'une dépendance a modifié :
 *   - la sortie d'Argon2id (`hash-wasm`)
 *   - l'algo XChaCha20-Poly1305 (`@noble/ciphers`)
 *   - le HKDF-SHA-256 (`@noble/hashes`)
 *   - **ou** la sérialisation CBOR (`cbor-x`, ordre des clés ou tagging).
 *
 * Tout coffre existant dans le même format devient illisible — il faut
 * BUMP `EnvelopeV1` → `v: 2` et fournir une lazy-migration.
 */
const EXPECTED_ENVELOPE_B64URL =
  'uQALYXYBY2FsZ3F4Y2hhY2hhMjBwb2x5MTMwNWNrZGa5AARkbmFtZWhhcmdvbjJpZGF0AWFtCGFwAWlzYWx0X3VzZXLYQFABAgMEBQYHCAkKCwwNDg8QaHZhdWx0X2lkeCQwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDFnaXRlbV9pZHgkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyZHdyYXDYQFgw09_N2EfQ7v9TENRAERjKR7k4hTgKQYlG3ZI8JZsI_HwHHaJ4e6ZFmTmaqnWVr9ObYmN02EBY4wvr1MkqmFaK1yaISHymP24lve4uPV7k6PBQ7sJXb4jnhn3z0OtMSOiA06sdTWGh2oigAfBG2I9s-gwAfJWbY_8HgF2GzLDXkAwbFH5mxns68fbctGHdaN7tG35GcKMrqVbsJACfl84HotHG87ikHONsU3TraQ5dKX7tLSP4QnkE15UGUYrWz82cYmBcFNfMkNl6q_40pm4Zwkaq7j0D6oW9v3O8PzdulOFySCjTeBPxv98mWyt2hgRP5b2o9zUfCSRq0nBZNYNIbgx5MfS084h8c2azAaKWP62d4XdIgpZnYx6DZ25vbmNlX3fYQFgY7KQLLxM7WpsFxTSr0ZDJTHmRY9T3y5-XZ25vbmNlX2PYQFgYcBtUIrUeaPKoBldB0D36LZnfgCMJudyAY2FhZNhAWF4wMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDE6MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyOnYxOnhjaGFjaGEyMHBvbHkxMzA1'

// --- Helpers internes ---------------------------------------------------

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

// --- Tests --------------------------------------------------------------

describe('Vecteurs déterministes — stabilité long-terme du format', () => {
  it('Argon2id(MASTER_PASSWORD, SALT, t=1 m=8 p=1) reste stable', async () => {
    const mk = await deriveMasterKey({
      password: MASTER_PASSWORD,
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const got = toHex(mk)
    if (process.env.PASS_CRYPTO_PRINT_VECTORS) {
      console.log('EXPECTED_MK_HEX =', got)
    }
    expect(got).toBe(EXPECTED_MK_HEX)
  })

  it('HKDF-SHA-256(MK, "vault-key", VAULT_ID) reste stable', async () => {
    const mk = await deriveMasterKey({
      password: MASTER_PASSWORD,
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const vk = deriveVaultKey(mk, VAULT_ID)
    const got = toHex(vk)
    if (process.env.PASS_CRYPTO_PRINT_VECTORS) {
      console.log('EXPECTED_VK_HEX =', got)
    }
    expect(got).toBe(EXPECTED_VK_HEX)
  })

  it('EnvelopeV1 encodée (RNG fixé seed=0xdeadc0de) round-trip propre', async () => {
    const mk = await deriveMasterKey({
      password: MASTER_PASSWORD,
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const vk = deriveVaultKey(mk, VAULT_ID)
    const env = buildEnvelope({
      vaultId: VAULT_ID,
      itemId: ITEM_ID,
      vaultKey: vk,
      plaintext: ITEM_PLAINTEXT,
      kdf: KDF_FIELD,
      saltUser: SALT_USER,
      rng: makeFixedRng(RNG_SEED),
    })
    const encoded = encodeEnvelope(env)
    if (process.env.PASS_CRYPTO_PRINT_VECTORS) {
      console.log('EXPECTED_ENVELOPE_B64URL =', encoded)
    }

    // 0. Stabilité bit-à-bit : aucune dépendance crypto n'a bougé sa sortie.
    expect(encoded).toBe(EXPECTED_ENVELOPE_B64URL)

    // 1. La sortie encodée doit décoder vers une enveloppe parsable.
    const reparsed = decodeEnvelope(encoded)
    expect(reparsed.v).toBe(1)
    expect(reparsed.alg).toBe('xchacha20poly1305')
    expect(reparsed.vault_id).toBe(VAULT_ID)
    expect(reparsed.item_id).toBe(ITEM_ID)

    // 2. Le déchiffrement doit redonner le plaintext exact.
    const recovered = openEnvelope({ envelope: reparsed, vaultKey: vk })
    expect(recovered).toEqual(ITEM_PLAINTEXT)

    // 3. Et via le helper haut-niveau (chemin réel utilisé par l'UI).
    const recovered2 = decryptItemFromVault({
      masterKey: mk,
      vaultId: VAULT_ID,
      encoded,
    })
    expect(recovered2).toEqual(ITEM_PLAINTEXT)
  })

  it('base64url maison reste stable sur un échantillon connu', () => {
    // Vecteur RFC 4648 § 10 (sans padding) :  "Many hands make light work."
    const sample = new TextEncoder().encode('Many hands make light work.')
    const expected = 'TWFueSBoYW5kcyBtYWtlIGxpZ2h0IHdvcmsu'
    expect(toBase64Url(sample)).toBe(expected)
    expect(new TextDecoder().decode(fromBase64Url(expected))).toBe(
      'Many hands make light work.'
    )
  })
})
