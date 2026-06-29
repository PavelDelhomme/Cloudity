import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  decodeEnvelope,
  decryptJsonPayload,
  deriveAppVaultKey,
  encryptJsonPayload,
  encodeEnvelope,
  randomKdfSalt,
} from '@cloudity/app-vault-crypto'
import { reencryptAppVaultDataForKind } from './appVaultPinRotation'
import * as api from '../../api'

vi.mock('../../api', () => ({
  fetchNotes: vi.fn(),
  updateNote: vi.fn(),
  fetchContacts: vi.fn(),
  updateContact: vi.fn(),
  fetchDriveNodes: vi.fn(),
  fetchDrivePhotosLocked: vi.fn(),
  downloadDriveFile: vi.fn(),
  putDriveNodeContentBlob: vi.fn(),
}))

const SCOPE = '1:notes:user@test.com'

describe('appVaultPinRotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-chiffre une note vault avec la nouvelle clé', async () => {
    const kdfSalt = randomKdfSalt()
    const oldKey = await deriveAppVaultKey('1234', 'notes', SCOPE, kdfSalt)
    const newKey = await deriveAppVaultKey('5678', 'notes', SCOPE, kdfSalt)
    const envelope = encryptJsonPayload(oldKey, 'notes', SCOPE, '42', {
      title: 'Secret',
      content: 'Corps',
    })
    const ciphertext = new TextDecoder().decode(encodeEnvelope(envelope))

    vi.mocked(api.fetchNotes).mockResolvedValue([
      {
        id: 42,
        tenant_id: 1,
        user_id: 1,
        title: 'Secret',
        content: '',
        vault_encrypted: true,
        vault_ciphertext: ciphertext,
        created_at: '',
        updated_at: '',
      },
    ])
    vi.mocked(api.updateNote).mockResolvedValue({ id: 42 })

    const count = await reencryptAppVaultDataForKind('token', 'notes', SCOPE, oldKey, newKey)
    expect(count).toBe(1)
    expect(api.updateNote).toHaveBeenCalledTimes(1)

    const updated = vi.mocked(api.updateNote).mock.calls[0]![2]
    const parsed = decodeEnvelope(new TextEncoder().encode(updated.vault_ciphertext!))
    const plain = decryptJsonPayload<{ title: string; content: string }>(newKey, parsed)
    expect(plain).toEqual({ title: 'Secret', content: 'Corps' })

    oldKey.fill(0)
    newKey.fill(0)
  })
})
