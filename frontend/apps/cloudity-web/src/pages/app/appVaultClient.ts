import {
  APP_VAULT_MIME,
  decodeEnvelope,
  decryptJsonPayload,
  encodeEnvelope,
  encryptJsonPayload,
  type AppVaultKind,
} from '@cloudity/app-vault-crypto'
import { toBase64Url, fromBase64Url } from '@cloudity/pass-crypto'
import { getAppVaultKey } from './appVaultKeySession'
import type { AppVaultKind } from '@cloudity/app-vault-crypto'
import type { AppLockedVaultKind } from './appLockedVault'

type VaultKind = AppVaultKind | AppLockedVaultKind

export type VaultNotePlain = { title: string; content: string }
export type VaultContactPlain = { name: string; email: string; phone?: string }
export type VaultDriveFilePlain = { plainMime: string; plainName: string; plain: string }

function requireKey(kind: VaultKind, scope: string): Uint8Array {
  const key = getAppVaultKey(kind, scope)
  if (!key) throw new Error('Déverrouillez le coffre avec votre code pour accéder aux données chiffrées.')
  return key
}

export function encryptNotePayload(
  kind: AppLockedVaultKind,
  scope: string,
  noteId: string,
  payload: VaultNotePlain
): string {
  const key = requireKey(kind, scope)
  const envelope = encryptJsonPayload(key, kind as AppVaultKind, scope, noteId, payload)
  return new TextDecoder().decode(encodeEnvelope(envelope))
}

export function decryptNotePayload(
  kind: AppLockedVaultKind,
  scope: string,
  noteId: number,
  ciphertext: string
): VaultNotePlain {
  const key = requireKey(kind, scope)
  const envelope = decodeEnvelope(new TextEncoder().encode(ciphertext))
  return decryptJsonPayload<VaultNotePlain>(key, envelope)
}

export function encryptContactPayload(
  kind: AppLockedVaultKind,
  scope: string,
  contactId: string,
  payload: VaultContactPlain
): string {
  const key = requireKey(kind, scope)
  const envelope = encryptJsonPayload(key, kind as AppVaultKind, scope, contactId, payload)
  return new TextDecoder().decode(encodeEnvelope(envelope))
}

export function decryptContactPayload(
  kind: AppLockedVaultKind,
  scope: string,
  contactId: number,
  ciphertext: string
): VaultContactPlain {
  const key = requireKey(kind, scope)
  const envelope = decodeEnvelope(new TextEncoder().encode(ciphertext))
  return decryptJsonPayload<VaultContactPlain>(key, envelope)
}

export function encryptDriveFileBytes(
  kind: AppLockedVaultKind,
  scope: string,
  nodeId: number,
  bytes: Uint8Array,
  plainMime: string,
  plainName: string
): Blob {
  const key = requireKey(kind, scope)
  const payload: VaultDriveFilePlain = {
    plainMime,
    plainName,
    plain: toBase64Url(bytes),
  }
  const envelope = encryptJsonPayload(key, kind as AppVaultKind, scope, String(nodeId), payload)
  return new Blob([encodeEnvelope(envelope)], { type: APP_VAULT_MIME })
}

export async function decryptDriveFileBlob(
  kind: AppLockedVaultKind,
  scope: string,
  nodeId: number,
  encrypted: ArrayBuffer
): Promise<{ bytes: Uint8Array; mime: string; name: string }> {
  const key = requireKey(kind, scope)
  const envelope = decodeEnvelope(new Uint8Array(encrypted))
  const payload = decryptJsonPayload<VaultDriveFilePlain>(key, envelope)
  return {
    bytes: fromBase64Url(payload.plain),
    mime: payload.plainMime,
    name: payload.plainName,
  }
}

export { APP_VAULT_MIME }
