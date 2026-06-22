import { describe, expect, it, vi, beforeEach } from 'vitest'
import { uploadDriveFileToVaultFolder } from './driveVaultUpload'
import * as api from '../../api'
import * as appVaultClient from './appVaultClient'
import * as appVaultKeySession from './appVaultKeySession'

vi.mock('../../api', () => ({
  uploadDriveFileWithProgress: vi.fn(),
  putDriveNodeContentBlob: vi.fn(),
}))

vi.mock('./appVaultClient', () => ({
  APP_VAULT_MIME: 'application/vnd.cloudity.vault+json;v=1',
  encryptDriveFileBytes: vi.fn(),
}))

vi.mock('./appVaultKeySession', () => ({
  getAppVaultKey: vi.fn(),
}))

describe('uploadDriveFileToVaultFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(appVaultKeySession.getAppVaultKey).mockReturnValue(new Uint8Array(32))
    vi.mocked(api.uploadDriveFileWithProgress).mockResolvedValue({ id: 7, name: 'doc.pdf', size: 10 })
    vi.mocked(appVaultClient.encryptDriveFileBytes).mockReturnValue(
      new Blob(['cipher'], { type: 'application/vnd.cloudity.vault+json;v=1' })
    )
    vi.mocked(api.putDriveNodeContentBlob).mockResolvedValue({ id: 7, size: 20 })
  })

  it('téléverse puis remplace le contenu par un blob chiffré', async () => {
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })
    const result = await uploadDriveFileToVaultFolder('token', '1:drive:user@test', 3, file)
    expect(api.uploadDriveFileWithProgress).toHaveBeenCalledWith('token', 3, file, undefined, undefined)
    expect(appVaultClient.encryptDriveFileBytes).toHaveBeenCalled()
    expect(api.putDriveNodeContentBlob).toHaveBeenCalledWith(
      'token',
      7,
      expect.any(Blob),
      'application/vnd.cloudity.vault+json;v=1'
    )
    expect(result.id).toBe(7)
  })

  it('refuse sans clé de coffre en session', async () => {
    vi.mocked(appVaultKeySession.getAppVaultKey).mockReturnValue(null)
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' })
    await expect(
      uploadDriveFileToVaultFolder('token', '1:drive:user@test', 3, file)
    ).rejects.toThrow(/Déverrouillez le coffre Drive/)
  })
})
