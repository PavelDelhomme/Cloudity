export const APP_LOCKED_PIN_MIN = 4
export const APP_LOCKED_PIN_MAX = 8
export const APP_LOCKED_SESSION_TTL_MS = 15 * 60 * 1000

export type AppLockedVaultKind = 'drive' | 'contacts' | 'notes'

type AppLockedVaultRecord = {
  pinSalt: string
  pinHash: string
  webauthnCredentialId?: string
}

type AppLockedSession = {
  expiresAt: number
}

const VAULT_PREFIX = 'cloudity.appLockedVault.v1'
const SESSION_PREFIX = 'cloudity.appLockedVault.session'

function vaultKey(kind: AppLockedVaultKind, scope: string): string {
  return `${VAULT_PREFIX}.${kind}.${scope}`
}

function sessionKey(kind: AppLockedVaultKind, scope: string): string {
  return `${SESSION_PREFIX}.${kind}.${scope}`
}

function bytesToB64u(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function randomSalt(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return bytesToB64u(buf.buffer)
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToB64u(digest)
}

function readVault(kind: AppLockedVaultKind, scope: string): AppLockedVaultRecord | null {
  try {
    const raw = localStorage.getItem(vaultKey(kind, scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppLockedVaultRecord>
    if (!parsed.pinSalt || !parsed.pinHash) return null
    return {
      pinSalt: parsed.pinSalt,
      pinHash: parsed.pinHash,
      webauthnCredentialId:
        typeof parsed.webauthnCredentialId === 'string' ? parsed.webauthnCredentialId : undefined,
    }
  } catch {
    return null
  }
}

function writeVault(kind: AppLockedVaultKind, scope: string, record: AppLockedVaultRecord): void {
  localStorage.setItem(vaultKey(kind, scope), JSON.stringify(record))
}

export function appLockedVaultScope(
  kind: AppLockedVaultKind,
  tenantId: number | null | undefined,
  email: string | null | undefined
): string | null {
  if (!tenantId || !email?.trim()) return null
  return `${tenantId}:${kind}:${email.trim().toLowerCase()}`
}

export function hasAppLockedPin(kind: AppLockedVaultKind, scope: string | null): boolean {
  if (!scope) return false
  return readVault(kind, scope) != null
}

export function validateAppLockedPinFormat(pin: string): string | null {
  const trimmed = pin.trim()
  if (!/^\d+$/.test(trimmed)) return 'Le code doit contenir uniquement des chiffres.'
  if (trimmed.length < APP_LOCKED_PIN_MIN || trimmed.length > APP_LOCKED_PIN_MAX) {
    return `Le code doit faire entre ${APP_LOCKED_PIN_MIN} et ${APP_LOCKED_PIN_MAX} chiffres.`
  }
  return null
}

export async function setupAppLockedPin(
  kind: AppLockedVaultKind,
  scope: string,
  pin: string,
  confirmPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pinError = validateAppLockedPinFormat(pin)
  if (pinError) return { ok: false, error: pinError }
  if (pin !== confirmPin) return { ok: false, error: 'Les codes ne correspondent pas.' }
  const salt = randomSalt()
  const pinHash = await hashPin(pin, salt)
  writeVault(kind, scope, { pinSalt: salt, pinHash })
  return { ok: true }
}

export async function verifyAppLockedPin(kind: AppLockedVaultKind, scope: string, pin: string): Promise<boolean> {
  const vault = readVault(kind, scope)
  if (!vault) return false
  const pinError = validateAppLockedPinFormat(pin)
  if (pinError) return false
  const candidate = await hashPin(pin, vault.pinSalt)
  return candidate === vault.pinHash
}

export function isAppLockedVaultUnlocked(
  kind: AppLockedVaultKind,
  scope: string | null,
  ttlMs: number = APP_LOCKED_SESSION_TTL_MS
): boolean {
  if (!scope) return false
  try {
    const raw = sessionStorage.getItem(sessionKey(kind, scope))
    if (!raw) return false
    const parsed = JSON.parse(raw) as AppLockedSession
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(sessionKey(kind, scope))
      return false
    }
    return true
  } catch {
    return false
  }
}

export function grantAppLockedVaultSession(
  kind: AppLockedVaultKind,
  scope: string,
  ttlMs: number = APP_LOCKED_SESSION_TTL_MS
): void {
  const session: AppLockedSession = { expiresAt: Date.now() + ttlMs }
  sessionStorage.setItem(sessionKey(kind, scope), JSON.stringify(session))
}

export function revokeAppLockedVaultSession(kind: AppLockedVaultKind, scope: string | null): void {
  if (!scope) return
  sessionStorage.removeItem(sessionKey(kind, scope))
}

export function clearAppLockedVault(kind: AppLockedVaultKind, scope: string): void {
  localStorage.removeItem(vaultKey(kind, scope))
  sessionStorage.removeItem(sessionKey(kind, scope))
}

export function isAppLockedWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

export function hasAppLockedWebAuthn(kind: AppLockedVaultKind, scope: string | null): boolean {
  if (!scope) return false
  return Boolean(readVault(kind, scope)?.webauthnCredentialId)
}

export async function registerAppLockedWebAuthn(kind: AppLockedVaultKind, scope: string, appLabel: string): Promise<void> {
  if (!isAppLockedWebAuthnSupported()) {
    throw new Error('Ce navigateur ne supporte pas la biométrie Web.')
  }
  const vault = readVault(kind, scope)
  if (!vault) throw new Error('Définissez d’abord un code pour le coffre local.')

  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  const userId = new Uint8Array(16)
  crypto.getRandomValues(userId)

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: `Cloudity ${appLabel}`, id: window.location.hostname },
      user: {
        id: userId,
        name: `${kind}-locked-${scope}`,
        displayName: `Coffre ${appLabel}`,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!cred) throw new Error('Enregistrement biométrique annulé.')
  writeVault(kind, scope, {
    ...vault,
    webauthnCredentialId: bytesToB64u(cred.rawId),
  })
}

export async function changeAppLockedPin(
  kind: AppLockedVaultKind,
  scope: string,
  currentPin: string,
  nextPin: string,
  confirmPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const valid = await verifyAppLockedPin(kind, scope, currentPin)
  if (!valid) return { ok: false, error: 'Code actuel incorrect.' }
  return setupAppLockedPin(kind, scope, nextPin, confirmPin)
}

export async function unlockAppLockedWithWebAuthn(kind: AppLockedVaultKind, scope: string): Promise<boolean> {
  if (!isAppLockedWebAuthnSupported()) return false
  const vault = readVault(kind, scope)
  const credentialId = vault?.webauthnCredentialId
  if (!credentialId) return false

  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64uToBytes(credentialId).buffer, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    return assertion != null
  } catch {
    return false
  }
}
