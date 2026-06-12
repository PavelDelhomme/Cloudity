import { describe, expect, it } from 'vitest'
import {
  decodeEnvelope,
  decryptJsonPayload,
  deriveAppVaultKey,
  encodeEnvelope,
  encryptJsonPayload,
  randomKdfSalt,
} from '../index'

describe('app-vault-crypto round-trip', () => {
  it('chiffre et déchiffre un payload JSON', async () => {
    const salt = randomKdfSalt()
    const key = await deriveAppVaultKey('1234', 'notes', '1:notes:user@test', salt)
    const envelope = encryptJsonPayload(key, 'notes', '1:notes:user@test', '42', {
      title: 'Secret',
      content: 'Corps chiffré',
    })
    const decoded = decryptJsonPayload<{ title: string; content: string }>(key, envelope)
    expect(decoded.title).toBe('Secret')
    expect(decoded.content).toBe('Corps chiffré')
    key.fill(0)
  })

  it('encode et decode une enveloppe stockée serveur', async () => {
    const salt = randomKdfSalt()
    const key = await deriveAppVaultKey('5678', 'drive', '1:drive:user@test', salt)
    const envelope = encryptJsonPayload(key, 'drive', '1:drive:user@test', '7', {
      plainMime: 'image/jpeg',
      plain: 'aGVsbG8=',
    })
    const wire = encodeEnvelope(envelope)
    const parsed = decodeEnvelope(wire)
    const out = decryptJsonPayload<{ plainMime: string; plain: string }>(key, parsed)
    expect(out.plainMime).toBe('image/jpeg')
    key.fill(0)
  })
})
