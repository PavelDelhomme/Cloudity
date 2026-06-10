import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPhotosLockedVault,
  grantPhotosLockedVaultSession,
  hasPhotosLockedPin,
  isPhotosLockedVaultUnlocked,
  photosLockedVaultScope,
  revokePhotosLockedVaultSession,
  setupPhotosLockedPin,
  verifyPhotosLockedPin,
} from './photosLockedVault'

const SCOPE = '1:user@test.com'

describe('photosLockedVault', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearPhotosLockedVault(SCOPE)
  })

  it('scope dérivé du tenant et de l’email', () => {
    expect(photosLockedVaultScope(1, 'User@Test.com')).toBe('1:user@test.com')
    expect(photosLockedVaultScope(null, 'a@b.fr')).toBeNull()
  })

  it('configure et vérifie un code PIN', async () => {
    expect(hasPhotosLockedPin(SCOPE)).toBe(false)
    const setup = await setupPhotosLockedPin(SCOPE, '1234', '1234')
    expect(setup.ok).toBe(true)
    expect(hasPhotosLockedPin(SCOPE)).toBe(true)
    await expect(verifyPhotosLockedPin(SCOPE, '1234')).resolves.toBe(true)
    await expect(verifyPhotosLockedPin(SCOPE, '9999')).resolves.toBe(false)
  })

  it('session de déverrouillage expirée', () => {
    expect(isPhotosLockedVaultUnlocked(SCOPE)).toBe(false)
    grantPhotosLockedVaultSession(SCOPE, 1000)
    expect(isPhotosLockedVaultUnlocked(SCOPE)).toBe(true)
    revokePhotosLockedVaultSession(SCOPE)
    expect(isPhotosLockedVaultUnlocked(SCOPE)).toBe(false)
  })
})
