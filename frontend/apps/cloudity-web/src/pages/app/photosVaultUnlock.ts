import { downloadDriveFile, putDriveNodeContentBlob } from '../../api'
import { decryptDriveFileBlob } from './appVaultClient'
import { getAppVaultKey } from './appVaultKeySession'

export async function decryptPhotoForUnlock(
  token: string,
  scope: string,
  nodeId: number
): Promise<{ blob: Blob; mime: string }> {
  if (!getAppVaultKey('photos', scope)) {
    throw new Error('Déverrouillez le coffre avec votre code pour restaurer la photo.')
  }
  const encrypted = await downloadDriveFile(token, nodeId)
  const { bytes, mime } = await decryptDriveFileBlob(
    'photos',
    scope,
    nodeId,
    await encrypted.arrayBuffer()
  )
  return { blob: new Blob([bytes], { type: mime }), mime }
}

export async function restoreUnlockedPhotoContent(
  token: string,
  scope: string,
  nodeId: number
): Promise<void> {
  const { blob, mime } = await decryptPhotoForUnlock(token, scope, nodeId)
  await putDriveNodeContentBlob(token, nodeId, blob, mime)
}
