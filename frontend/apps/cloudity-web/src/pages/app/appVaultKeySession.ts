import { fromBase64Url, toBase64Url } from '@cloudity/pass-crypto'
import { deriveAppVaultKey, type AppVaultKind } from '@cloudity/app-vault-crypto'
import { getAppLockedKdfSalt, type AppLockedVaultKind } from './appLockedVault'
import { getPhotosLockedKdfSalt } from './photos/photosLockedVault'

const memoryKeys = new Map<string, Uint8Array>()

function sessionKey(kind: AppVaultKind, scope: string): string {
  return `${kind}:${scope}`
}

function resolveKdfSalt(kind: AppVaultKind, scope: string): string | null {
  if (kind === 'photos') return getPhotosLockedKdfSalt(scope)
  return getAppLockedKdfSalt(kind as AppLockedVaultKind, scope)
}

export function hasAppVaultKey(kind: AppVaultKind, scope: string | null): boolean {
  if (!scope) return false
  return memoryKeys.has(sessionKey(kind, scope))
}

export function getAppVaultKey(kind: AppVaultKind, scope: string): Uint8Array | null {
  const key = memoryKeys.get(sessionKey(kind, scope))
  return key ? new Uint8Array(key) : null
}

export function setAppVaultKey(kind: AppVaultKind, scope: string, key: Uint8Array): void {
  memoryKeys.set(sessionKey(kind, scope), new Uint8Array(key))
}

export function clearAppVaultKey(kind: AppVaultKind, scope: string | null): void {
  if (!scope) return
  const existing = memoryKeys.get(sessionKey(kind, scope))
  existing?.fill(0)
  memoryKeys.delete(sessionKey(kind, scope))
}

export async function deriveAndStoreAppVaultKey(
  kind: AppVaultKind,
  scope: string,
  pin: string
): Promise<void> {
  const kdfSalt = resolveKdfSalt(kind, scope)
  if (!kdfSalt) throw new Error('Coffre local non initialisé.')
  const key = await deriveAppVaultKey(pin, kind, scope, kdfSalt)
  setAppVaultKey(kind, scope, key)
  key.fill(0)
}

export function exportAppVaultKeyB64u(kind: AppVaultKind, scope: string): string | null {
  const key = memoryKeys.get(sessionKey(kind, scope))
  return key ? toBase64Url(key) : null
}

export function importAppVaultKeyB64u(kind: AppVaultKind, scope: string, b64u: string): void {
  setAppVaultKey(kind, scope, fromBase64Url(b64u))
}
