/**
 * Tests anti-tampering AEAD : flip 1 bit dans le ciphertext / wrap / aad doit
 * provoquer une erreur Poly1305.
 *
 * Critère d'acceptation sprint Pass (cf. SPRINT-PASS-2026-05.md § 5).
 */

import { decode as cborDecode, encode as cborEncode } from 'cbor-x'
import { describe, expect, it } from 'vitest'
import {
  decodeEnvelope,
  decryptItemFromVault,
  deriveMasterKey,
  encodeEnvelope,
  encryptItemForVault,
  openEnvelope,
  deriveVaultKey,
} from '..'
import type { EnvelopeV1, ItemPlaintextV1, KdfDescriptor } from '../types'
import { ARGON2ID_TEST } from './_helpers'

const SALT_USER = new Uint8Array(16).fill(0x5a)
const KDF_FIELD: KdfDescriptor = {
  name: 'argon2id',
  t: ARGON2ID_TEST.t,
  m: ARGON2ID_TEST.m,
  p: ARGON2ID_TEST.p,
}
const VAULT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const PLAIN: ItemPlaintextV1 = {
  schema: 1,
  type: 'login',
  fields: { title: 'Tamper test', username: 'u', password: 'p' },
}

async function makeEnvelope(): Promise<{ env: EnvelopeV1; mk: Uint8Array }> {
  const mk = await deriveMasterKey({
    password: 'tamper-master',
    salt: SALT_USER,
    params: ARGON2ID_TEST,
  })
  const encoded = encryptItemForVault({
    masterKey: mk,
    vaultId: VAULT_ID,
    itemId: ITEM_ID,
    plaintext: PLAIN,
    kdf: KDF_FIELD,
    saltUser: SALT_USER,
  })
  return { env: decodeEnvelope(encoded), mk }
}

function flipFirstBit(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(buf)
  out[0] ^= 0x01
  return out
}

describe('AEAD tamper detection', () => {
  it('flip 1 bit dans `ct` ⇒ erreur de déchiffrement', async () => {
    const { env, mk } = await makeEnvelope()
    const tampered: EnvelopeV1 = { ...env, ct: flipFirstBit(env.ct) }
    const encoded = encodeEnvelope(tampered)
    expect(() =>
      decryptItemFromVault({ masterKey: mk, vaultId: VAULT_ID, encoded })
    ).toThrow()
  })

  it('flip 1 bit dans `wrap` (clé de wrap chiffrée) ⇒ erreur', async () => {
    const { env, mk } = await makeEnvelope()
    const tampered: EnvelopeV1 = { ...env, wrap: flipFirstBit(env.wrap) }
    const encoded = encodeEnvelope(tampered)
    expect(() =>
      decryptItemFromVault({ masterKey: mk, vaultId: VAULT_ID, encoded })
    ).toThrow()
  })

  it("flip 1 bit dans `aad` ⇒ erreur (l'AAD est authentifiée)", async () => {
    const { env, mk } = await makeEnvelope()
    const tampered: EnvelopeV1 = { ...env, aad: flipFirstBit(env.aad) }
    // openEnvelope doit refuser parce que l'AAD a changé : Poly1305 mismatch
    const vk = deriveVaultKey(mk, VAULT_ID)
    expect(() => openEnvelope({ envelope: tampered, vaultKey: vk })).toThrow()
  })

  it('flip 1 bit dans `nonce_c` ⇒ erreur (le nonce est authentifié implicitement)', async () => {
    const { env, mk } = await makeEnvelope()
    const tampered: EnvelopeV1 = { ...env, nonce_c: flipFirstBit(env.nonce_c) }
    const vk = deriveVaultKey(mk, VAULT_ID)
    expect(() => openEnvelope({ envelope: tampered, vaultKey: vk })).toThrow()
  })

  it('flip 1 bit balayé dans `ct` à plusieurs positions ⇒ erreur à chaque fois', async () => {
    const { env, mk } = await makeEnvelope()
    const positions = [0, 1, env.ct.length >> 1, env.ct.length - 1]
    for (const pos of positions) {
      const tamperedCt = new Uint8Array(env.ct)
      tamperedCt[pos] ^= 0x80
      const tampered: EnvelopeV1 = { ...env, ct: tamperedCt }
      const encoded = encodeEnvelope(tampered)
      // round-trip via base64url + CBOR pour matcher le flux serveur réel
      const decoded = decodeEnvelope(encoded)
      // sanity : le décodage CBOR/base64url doit avoir préservé la modification
      expect(decoded.ct[pos]).toBe(tamperedCt[pos])
      expect(() =>
        decryptItemFromVault({ masterKey: mk, vaultId: VAULT_ID, encoded })
      ).toThrow()
    }
  })
})

// `cbor-x` et helpers gardés pour usage éventuel ; ESLint ne se plaint pas car ils
// sont importés via les helpers et peuvent servir aux tests qui suivent.
void cborDecode
void cborEncode
