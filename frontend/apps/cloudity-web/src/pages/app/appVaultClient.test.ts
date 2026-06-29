import { describe, expect, it } from 'vitest'
import { encryptNotePayload, decryptNotePayload } from './appVaultClient'
import { deriveAndStoreAppVaultKey, setAppVaultKey } from './appVaultKeySession'
import { setupAppLockedPin, getAppLockedKdfSalt } from './appLockedVault'
import { deriveAppVaultKey, randomKdfSalt } from '@cloudity/app-vault-crypto'

describe('appVaultClient', () => {
  it('chiffre et déchiffre une note avec la clé de session', async () => {
    const scope = '1:notes:test@example.com'
    localStorage.clear()
    sessionStorage.clear()
    await setupAppLockedPin('notes', scope, '4321', '4321')
    await deriveAndStoreAppVaultKey('notes', scope, '4321')
    const ciphertext = encryptNotePayload('notes', scope, '99', { title: 'T', content: 'C' })
    const plain = decryptNotePayload('notes', scope, 99, ciphertext)
    expect(plain.title).toBe('T')
    expect(plain.content).toBe('C')
  })

  it('refuse le déchiffrement avec une mauvaise clé (tamper PIN)', async () => {
    const scope = '1:notes:tamper@example.com'
    localStorage.clear()
    sessionStorage.clear()
    await setupAppLockedPin('notes', scope, '1111', '1111')
    await deriveAndStoreAppVaultKey('notes', scope, '1111')
    const ciphertext = encryptNotePayload('notes', scope, '1', { title: 'Secret', content: 'X' })
    const kdfSalt = getAppLockedKdfSalt('notes', scope)!
    const wrongKey = await deriveAppVaultKey('9999', 'notes', scope, kdfSalt)
    setAppVaultKey('notes', scope, wrongKey)
    expect(() => decryptNotePayload('notes', scope, 1, ciphertext)).toThrow()
    wrongKey.fill(0)
  })
})
