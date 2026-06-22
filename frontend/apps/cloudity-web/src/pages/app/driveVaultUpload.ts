import { putDriveNodeContentBlob, uploadDriveFileWithProgress } from '../../api'
import { APP_VAULT_MIME, encryptDriveFileBytes } from './appVaultClient'
import { getAppVaultKey } from './appVaultKeySession'

export async function uploadDriveFileToVaultFolder(
  token: string,
  scope: string,
  parentId: number | null,
  file: File,
  onProgress?: (percent: number) => void,
  overwrite?: boolean
): Promise<{ id: number; name: string; size: number }> {
  if (!getAppVaultKey('drive', scope)) {
    throw new Error('Déverrouillez le coffre Drive pour téléverser dans un dossier chiffré.')
  }
  const created = await uploadDriveFileWithProgress(token, parentId, file, onProgress, overwrite)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const encrypted = encryptDriveFileBytes(
    'drive',
    scope,
    created.id,
    bytes,
    file.type || 'application/octet-stream',
    file.name
  )
  await putDriveNodeContentBlob(token, created.id, encrypted, APP_VAULT_MIME)
  return created
}
