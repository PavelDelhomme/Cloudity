import { describe, expect, it } from 'vitest'
import { encryptNotePayload, decryptNotePayload } from './appVaultClient'
import { deriveAndStoreAppVaultKey } from './appVaultKeySession'
import { setupAppLockedPin } from './appLockedVault'

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
})
