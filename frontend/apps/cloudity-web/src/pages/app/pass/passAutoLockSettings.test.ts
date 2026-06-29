import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_PASS_AUTO_LOCK_MS,
  PASS_AUTO_LOCK_STORAGE_KEY,
  formatPassAutoLockLabel,
  getPassAutoLockAfterMs,
  setPassAutoLockAfterMs,
} from './passAutoLockSettings'

describe('passAutoLockSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne 5 min par défaut', () => {
    expect(getPassAutoLockAfterMs()).toBe(DEFAULT_PASS_AUTO_LOCK_MS)
  })

  it('persiste et relit un délai valide', () => {
    setPassAutoLockAfterMs(15 * 60_000)
    expect(getPassAutoLockAfterMs()).toBe(15 * 60_000)
    expect(localStorage.getItem(PASS_AUTO_LOCK_STORAGE_KEY)).toBe(String(15 * 60_000))
  })

  it('ignore une valeur invalide en localStorage', () => {
    localStorage.setItem(PASS_AUTO_LOCK_STORAGE_KEY, '999999')
    expect(getPassAutoLockAfterMs()).toBe(DEFAULT_PASS_AUTO_LOCK_MS)
  })

  it('accepte 0 (jamais)', () => {
    setPassAutoLockAfterMs(0)
    expect(getPassAutoLockAfterMs()).toBe(0)
    expect(formatPassAutoLockLabel(0)).toBe('Jamais')
  })
})
