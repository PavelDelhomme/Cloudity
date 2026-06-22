import { beforeEach, describe, expect, it } from 'vitest'
import {
  appLockedVaultScope,
  changeAppLockedPin,
  clearAppLockedVault,
  getAppLockedKdfSalt,
  grantAppLockedVaultSession,
  isAppLockedVaultUnlocked,
  revokeAppLockedVaultSession,
  setupAppLockedPin,
  verifyAppLockedPin,
} from './appLockedVault'

const SCOPE = '1:drive:user@test.com'

describe('appLockedVault', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearAppLockedVault('drive', SCOPE)
  })

  it('construit un scope stable par app et utilisateur', () => {
    expect(appLockedVaultScope('drive', 1, 'USER@Test.com ')).toBe(SCOPE)
    expect(appLockedVaultScope('notes', null, 'user@test.com')).toBeNull()
  })

  it('configure et vérifie un code PIN local', async () => {
    await expect(setupAppLockedPin('drive', SCOPE, '1234', '9999')).resolves.toEqual({
      ok: false,
      error: 'Les codes ne correspondent pas.',
    })

    await expect(setupAppLockedPin('drive', SCOPE, '1234', '1234')).resolves.toEqual({ ok: true })
    await expect(verifyAppLockedPin('drive', SCOPE, '0000')).resolves.toBe(false)
    await expect(verifyAppLockedPin('drive', SCOPE, '1234')).resolves.toBe(true)
  })

  it('change le code PIN après vérification du code actuel', async () => {
    await setupAppLockedPin('drive', SCOPE, '1234', '1234')
    await expect(changeAppLockedPin('drive', SCOPE, '9999', '5678', '5678')).resolves.toEqual({
      ok: false,
      error: 'Code actuel incorrect.',
    })
    const kdfBefore = getAppLockedKdfSalt('drive', SCOPE)
    await expect(changeAppLockedPin('drive', SCOPE, '1234', '5678', '5678')).resolves.toEqual({ ok: true })
    await expect(verifyAppLockedPin('drive', SCOPE, '5678')).resolves.toBe(true)
    expect(getAppLockedKdfSalt('drive', SCOPE)).toBe(kdfBefore)
  })

  it('gère la session temporaire du coffre', () => {
    expect(isAppLockedVaultUnlocked('drive', SCOPE)).toBe(false)
    grantAppLockedVaultSession('drive', SCOPE, 60_000)
    expect(isAppLockedVaultUnlocked('drive', SCOPE)).toBe(true)
    revokeAppLockedVaultSession('drive', SCOPE)
    expect(isAppLockedVaultUnlocked('drive', SCOPE)).toBe(false)
  })
})
