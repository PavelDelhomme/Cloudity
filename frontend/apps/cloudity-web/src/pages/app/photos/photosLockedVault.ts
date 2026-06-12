export const PHOTOS_LOCKED_PIN_MIN = 4
export const PHOTOS_LOCKED_PIN_MAX = 8
export const PHOTOS_LOCKED_SESSION_TTL_MS = 15 * 60 * 1000

type PhotosLockedVaultRecord = {
  pinSalt: string
  pinHash: string
  kdfSalt: string
  webauthnCredentialId?: string
}

type PhotosLockedSession = {
  expiresAt: number
  vaultKeyB64u?: string
}

const VAULT_PREFIX = 'cloudity.photos.lockedVault.v1'
const SESSION_PREFIX = 'cloudity.photos.lockedVault.session'

function vaultKey(scope: string): string {
  return `${VAULT_PREFIX}.${scope}`
}

function sessionKey(scope: string): string {
  return `${SESSION_PREFIX}.${scope}`
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

function readVault(scope: string): PhotosLockedVaultRecord | null {
  try {
    const raw = localStorage.getItem(vaultKey(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PhotosLockedVaultRecord>
    if (!parsed.pinSalt || !parsed.pinHash) return null
    return {
      pinSalt: parsed.pinSalt,
      pinHash: parsed.pinHash,
      kdfSalt: typeof parsed.kdfSalt === 'string' ? parsed.kdfSalt : parsed.pinSalt,
      webauthnCredentialId:
        typeof parsed.webauthnCredentialId === 'string' ? parsed.webauthnCredentialId : undefined,
    }
  } catch {
    return null
  }
}

function writeVault(scope: string, record: PhotosLockedVaultRecord): void {
  localStorage.setItem(vaultKey(scope), JSON.stringify(record))
}

export function photosLockedVaultScope(tenantId: number | null | undefined, email: string | null | undefined): string | null {
  if (!tenantId || !email?.trim()) return null
  return `${tenantId}:${email.trim().toLowerCase()}`
}

export function hasPhotosLockedPin(scope: string | null): boolean {
  if (!scope) return false
  return readVault(scope) != null
}

export function validatePhotosLockedPinFormat(pin: string): string | null {
  const trimmed = pin.trim()
  if (!/^\d+$/.test(trimmed)) return 'Le code doit contenir uniquement des chiffres.'
  if (trimmed.length < PHOTOS_LOCKED_PIN_MIN || trimmed.length > PHOTOS_LOCKED_PIN_MAX) {
    return `Le code doit faire entre ${PHOTOS_LOCKED_PIN_MIN} et ${PHOTOS_LOCKED_PIN_MAX} chiffres.`
  }
  return null
}

export async function setupPhotosLockedPin(
  scope: string,
  pin: string,
  confirmPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pinError = validatePhotosLockedPinFormat(pin)
  if (pinError) return { ok: false, error: pinError }
  if (pin !== confirmPin) return { ok: false, error: 'Les codes ne correspondent pas.' }
  const salt = randomSalt()
  const kdfSalt = randomSalt()
  const pinHash = await hashPin(pin, salt)
  writeVault(scope, { pinSalt: salt, pinHash, kdfSalt })
  return { ok: true }
}

export function getPhotosLockedKdfSalt(scope: string): string | null {
  return readVault(scope)?.kdfSalt ?? null
}

export async function verifyPhotosLockedPin(scope: string, pin: string): Promise<boolean> {
  const vault = readVault(scope)
  if (!vault) return false
  const pinError = validatePhotosLockedPinFormat(pin)
  if (pinError) return false
  const candidate = await hashPin(pin, vault.pinSalt)
  return candidate === vault.pinHash
}

export function isPhotosLockedVaultUnlocked(
  scope: string | null,
  ttlMs: number = PHOTOS_LOCKED_SESSION_TTL_MS
): boolean {
  if (!scope) return false
  try {
    const raw = sessionStorage.getItem(sessionKey(scope))
    if (!raw) return false
    const parsed = JSON.parse(raw) as PhotosLockedSession
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(sessionKey(scope))
      return false
    }
    return true
  } catch {
    return false
  }
}

export function grantPhotosLockedVaultSession(
  scope: string,
  ttlMs: number = PHOTOS_LOCKED_SESSION_TTL_MS,
  vaultKeyB64u?: string | null
): void {
  const session: PhotosLockedSession = { expiresAt: Date.now() + ttlMs }
  if (vaultKeyB64u) session.vaultKeyB64u = vaultKeyB64u
  sessionStorage.setItem(sessionKey(scope), JSON.stringify(session))
}

export function readPhotosLockedVaultKeyB64u(scope: string): string | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PhotosLockedSession
    return typeof parsed.vaultKeyB64u === 'string' ? parsed.vaultKeyB64u : null
  } catch {
    return null
  }
}

export function revokePhotosLockedVaultSession(scope: string | null): void {
  if (!scope) return
  sessionStorage.removeItem(sessionKey(scope))
}

export function clearPhotosLockedVault(scope: string): void {
  localStorage.removeItem(vaultKey(scope))
  sessionStorage.removeItem(sessionKey(scope))
}

export function isPhotosLockedWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

export function hasPhotosLockedWebAuthn(scope: string | null): boolean {
  if (!scope) return false
  return Boolean(readVault(scope)?.webauthnCredentialId)
}

export async function registerPhotosLockedWebAuthn(scope: string): Promise<void> {
  if (!isPhotosLockedWebAuthnSupported()) {
    throw new Error('Ce navigateur ne supporte pas la biométrie Web.')
  }
  const vault = readVault(scope)
  if (!vault) throw new Error('Définissez d’abord un code pour le coffre verrouillé.')

  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  const userId = new Uint8Array(16)
  crypto.getRandomValues(userId)

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Cloudity Photos', id: window.location.hostname },
      user: {
        id: userId,
        name: `photos-locked-${scope}`,
        displayName: 'Coffre Photos verrouillé',
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
  writeVault(scope, {
    ...vault,
    webauthnCredentialId: bytesToB64u(cred.rawId),
  })
}

export async function unlockPhotosLockedWithWebAuthn(scope: string): Promise<boolean> {
  if (!isPhotosLockedWebAuthnSupported()) return false
  const vault = readVault(scope)
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

export async function changePhotosLockedPin(
  scope: string,
  currentPin: string,
  nextPin: string,
  confirmPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const valid = await verifyPhotosLockedPin(scope, currentPin)
  if (!valid) return { ok: false, error: 'Code actuel incorrect.' }
  return setupPhotosLockedPin(scope, nextPin, confirmPin)
}
