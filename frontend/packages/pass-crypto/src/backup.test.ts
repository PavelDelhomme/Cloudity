import { describe, expect, it } from 'vitest'
import { buildPassBackupV1, parsePassBackupJson, passBackupStats } from './backup'

describe('pass backup v1', () => {
  it('build + parse roundtrip', () => {
    const backup = buildPassBackupV1({
      userId: '42',
      vaults: [
        {
          id: 1,
          name: 'Perso',
          items: [{ id: 10, ciphertext: 'abc', format_version: 1 }],
        },
      ],
    })
    const parsed = parsePassBackupJson(backup)
    expect(parsed.user_id).toBe('42')
    expect(parsed.vaults[0]?.name).toBe('Perso')
    expect(passBackupStats(parsed)).toEqual({ vaultCount: 1, itemCount: 1 })
  })

  it('rejects wrong schema', () => {
    expect(() => parsePassBackupJson({ schema: 'other', user_id: '1', vaults: [] })).toThrow(/schema/)
  })
})
