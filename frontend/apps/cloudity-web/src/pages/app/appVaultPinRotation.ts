import {
  APP_VAULT_MIME,
  decodeEnvelope,
  decryptJsonPayload,
  deriveAppVaultKey,
  encodeEnvelope,
  encryptJsonPayload,
  type AppVaultKind,
} from '@cloudity/app-vault-crypto'
import {
  downloadDriveFile,
  fetchContacts,
  fetchDriveNodes,
  fetchDrivePhotosLocked,
  fetchNotes,
  putDriveNodeContentBlob,
  updateContact,
  updateNote,
  type DriveNode,
} from '../../api'
import type { VaultContactPlain, VaultDriveFilePlain, VaultNotePlain } from './appVaultClient'
import {
  exportAppVaultKeyB64u,
  setAppVaultKey,
} from './appVaultKeySession'

export type VaultPinRotationProgress = {
  phase: 'notes' | 'contacts' | 'drive' | 'photos'
  done: number
  total: number
}

export type VaultPinRotationHandlers = {
  verifyPin: (scope: string, pin: string) => Promise<boolean>
  changePin: (
    scope: string,
    currentPin: string,
    nextPin: string,
    confirmPin: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  getKdfSalt: (scope: string) => string | null
  /** Met à jour la session navigateur avec la nouvelle clé dérivée (optionnel). */
  onSessionKeyRotated?: (scope: string, vaultKeyB64u: string) => void
}

function reencryptJsonCiphertext<T>(
  oldKey: Uint8Array,
  newKey: Uint8Array,
  kind: AppVaultKind,
  scope: string,
  resourceId: string,
  ciphertext: string
): string {
  const envelope = decodeEnvelope(new TextEncoder().encode(ciphertext))
  const plain = decryptJsonPayload<T>(oldKey, envelope)
  const next = encryptJsonPayload(newKey, kind, scope, resourceId, plain)
  return new TextDecoder().decode(encodeEnvelope(next))
}

async function reencryptDriveVaultBlob(
  oldKey: Uint8Array,
  newKey: Uint8Array,
  kind: AppVaultKind,
  scope: string,
  nodeId: number,
  encrypted: ArrayBuffer
): Promise<Blob> {
  const envelope = decodeEnvelope(new Uint8Array(encrypted))
  const payload = decryptJsonPayload<VaultDriveFilePlain>(oldKey, envelope)
  const next = encryptJsonPayload(newKey, kind, scope, String(nodeId), payload)
  return new Blob([encodeEnvelope(next)], { type: APP_VAULT_MIME })
}

async function collectDriveVaultEncryptedFiles(token: string): Promise<DriveNode[]> {
  const roots = await fetchDriveNodes(token, null)
  const vaultRoots = roots.filter((n) => n.is_folder && n.is_vault_folder)
  const files: DriveNode[] = []

  async function walk(parentId: number): Promise<void> {
    const children = await fetchDriveNodes(token, parentId)
    for (const node of children) {
      if (node.is_folder) {
        await walk(node.id)
      } else if (node.vault_encrypted) {
        files.push(node)
      }
    }
  }

  for (const folder of vaultRoots) {
    await walk(folder.id)
  }
  return files
}

async function reencryptNotes(
  token: string,
  kind: AppVaultKind,
  scope: string,
  oldKey: Uint8Array,
  newKey: Uint8Array,
  onProgress?: (p: VaultPinRotationProgress) => void
): Promise<number> {
  const notes = await fetchNotes(token)
  const encrypted = notes.filter((n) => n.vault_encrypted && n.vault_ciphertext)
  let done = 0
  for (const note of encrypted) {
    const ciphertext = reencryptJsonCiphertext<VaultNotePlain>(
      oldKey,
      newKey,
      kind,
      scope,
      String(note.id),
      note.vault_ciphertext!
    )
    await updateNote(token, note.id, {
      title: note.title,
      content: note.content,
      vault_encrypted: true,
      vault_ciphertext: ciphertext,
    })
    done += 1
    onProgress?.({ phase: 'notes', done, total: encrypted.length })
  }
  return done
}

async function reencryptContacts(
  token: string,
  kind: AppVaultKind,
  scope: string,
  oldKey: Uint8Array,
  newKey: Uint8Array,
  onProgress?: (p: VaultPinRotationProgress) => void
): Promise<number> {
  const contacts = await fetchContacts(token)
  const encrypted = contacts.filter((c) => c.vault_encrypted && c.vault_ciphertext)
  let done = 0
  for (const contact of encrypted) {
    const ciphertext = reencryptJsonCiphertext<VaultContactPlain>(
      oldKey,
      newKey,
      kind,
      scope,
      String(contact.id),
      contact.vault_ciphertext!
    )
    await updateContact(token, contact.id, {
      vault_encrypted: true,
      vault_ciphertext: ciphertext,
    })
    done += 1
    onProgress?.({ phase: 'contacts', done, total: encrypted.length })
  }
  return done
}

async function reencryptDriveVaultFiles(
  token: string,
  kind: Extract<AppVaultKind, 'drive' | 'photos'>,
  scope: string,
  oldKey: Uint8Array,
  newKey: Uint8Array,
  nodes: DriveNode[],
  onProgress?: (p: VaultPinRotationProgress) => void
): Promise<number> {
  let done = 0
  for (const node of nodes) {
    const encrypted = await downloadDriveFile(token, node.id)
    const blob = await reencryptDriveVaultBlob(
      oldKey,
      newKey,
      kind,
      scope,
      node.id,
      await encrypted.arrayBuffer()
    )
    await putDriveNodeContentBlob(token, node.id, blob, APP_VAULT_MIME)
    done += 1
    onProgress?.({ phase: kind === 'photos' ? 'photos' : 'drive', done, total: nodes.length })
  }
  return done
}

/**
 * Re-chiffre toutes les données E2EE d'une app coffre avec une nouvelle clé dérivée du PIN.
 */
export async function reencryptAppVaultDataForKind(
  token: string,
  kind: AppVaultKind,
  scope: string,
  oldKey: Uint8Array,
  newKey: Uint8Array,
  onProgress?: (p: VaultPinRotationProgress) => void
): Promise<number> {
  let total = 0
  if (kind === 'notes') {
    total += await reencryptNotes(token, kind, scope, oldKey, newKey, onProgress)
  } else if (kind === 'contacts') {
    total += await reencryptContacts(token, kind, scope, oldKey, newKey, onProgress)
  } else if (kind === 'drive') {
    const files = await collectDriveVaultEncryptedFiles(token)
    total += await reencryptDriveVaultFiles(token, 'drive', scope, oldKey, newKey, files, onProgress)
  } else if (kind === 'photos') {
    const locked = await fetchDrivePhotosLocked(token)
    const encrypted = locked.filter((n) => n.vault_encrypted)
    total += await reencryptDriveVaultFiles(token, 'photos', scope, oldKey, newKey, encrypted, onProgress)
  }
  return total
}

/**
 * Change le PIN local et re-chiffre automatiquement les blobs serveur associés.
 */
export async function rotateAppVaultPin(
  token: string,
  kind: AppVaultKind,
  scope: string,
  currentPin: string,
  nextPin: string,
  confirmPin: string,
  handlers: VaultPinRotationHandlers,
  onProgress?: (p: VaultPinRotationProgress) => void
): Promise<{ ok: true; reencrypted: number } | { ok: false; error: string }> {
  const valid = await handlers.verifyPin(scope, currentPin)
  if (!valid) return { ok: false, error: 'Code actuel incorrect.' }

  const kdfSalt = handlers.getKdfSalt(scope)
  if (!kdfSalt) return { ok: false, error: 'Coffre local introuvable.' }

  const oldKey = await deriveAppVaultKey(currentPin, kind, scope, kdfSalt)
  const newKey = await deriveAppVaultKey(nextPin, kind, scope, kdfSalt)

  let reencrypted = 0
  try {
    reencrypted = await reencryptAppVaultDataForKind(token, kind, scope, oldKey, newKey, onProgress)
  } catch (err) {
    oldKey.fill(0)
    newKey.fill(0)
    const msg = err instanceof Error ? err.message : 'Échec du re-chiffrement.'
    return { ok: false, error: msg }
  }

  const pinResult = await handlers.changePin(scope, currentPin, nextPin, confirmPin)
  if (!pinResult.ok) {
    oldKey.fill(0)
    newKey.fill(0)
    return pinResult
  }

  setAppVaultKey(kind, scope, newKey)
  const vaultKeyB64u = exportAppVaultKeyB64u(kind, scope)
  if (vaultKeyB64u) handlers.onSessionKeyRotated?.(scope, vaultKeyB64u)

  oldKey.fill(0)
  newKey.fill(0)
  return { ok: true, reencrypted }
}
