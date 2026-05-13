import { describe, expect, it } from 'vitest'
import {
  decryptItemFromVault,
  deriveMasterKey,
  encryptItemForVault,
} from '..'
import type { ItemPlaintextV1, KdfDescriptor } from '../types'
import { ARGON2ID_TEST } from './_helpers'

const SALT_USER = new Uint8Array(16).fill(0xa5)

const KDF_FIELD: KdfDescriptor = {
  name: 'argon2id',
  t: ARGON2ID_TEST.t,
  m: ARGON2ID_TEST.m,
  p: ARGON2ID_TEST.p,
}

const VAULT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const ITEM_LOGIN: ItemPlaintextV1 = {
  schema: 1,
  type: 'login',
  fields: {
    title: 'Acme Corp — admin',
    url: 'https://acme.example/login',
    username: 'pavel@example.org',
    password: 'C0rrect!Horse-Battery-Staple',
  },
  notes: 'Compte secours, MFA OTP via app interne.',
  tags: ['perso', 'priorité-haute'],
}

describe('EnvelopeV1 round-trip', () => {
  it('chiffre puis déchiffre un item login (égalité stricte)', async () => {
    const masterKey = await deriveMasterKey({
      password: 'sprint-pass-test-master',
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const encoded = encryptItemForVault({
      masterKey,
      vaultId: VAULT_ID,
      itemId: ITEM_ID,
      plaintext: ITEM_LOGIN,
      kdf: KDF_FIELD,
      saltUser: SALT_USER,
    })
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(40)

    const recovered = decryptItemFromVault({
      masterKey,
      vaultId: VAULT_ID,
      encoded,
    })
    expect(recovered).toEqual(ITEM_LOGIN)
  })

  it('refuse un mauvais mot de passe maître (Poly1305 ⇒ erreur)', async () => {
    const goodKey = await deriveMasterKey({
      password: 'good-password',
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const wrongKey = await deriveMasterKey({
      password: 'wrong-password',
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const encoded = encryptItemForVault({
      masterKey: goodKey,
      vaultId: VAULT_ID,
      itemId: ITEM_ID,
      plaintext: ITEM_LOGIN,
      kdf: KDF_FIELD,
      saltUser: SALT_USER,
    })
    expect(() =>
      decryptItemFromVault({ masterKey: wrongKey, vaultId: VAULT_ID, encoded })
    ).toThrow()
  })

  it('refuse un ciphertext appartenant à un autre coffre (vault_id mismatch)', async () => {
    const masterKey = await deriveMasterKey({
      password: 'sprint-pass',
      salt: SALT_USER,
      params: ARGON2ID_TEST,
    })
    const encoded = encryptItemForVault({
      masterKey,
      vaultId: VAULT_ID,
      itemId: ITEM_ID,
      plaintext: ITEM_LOGIN,
      kdf: KDF_FIELD,
      saltUser: SALT_USER,
    })
    expect(() =>
      decryptItemFromVault({
        masterKey,
        vaultId: '99999999-9999-4999-8999-999999999999',
        encoded,
      })
    ).toThrow(/vault_id mismatch/)
  })
})
