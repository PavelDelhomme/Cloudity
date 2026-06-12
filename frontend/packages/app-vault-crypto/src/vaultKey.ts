import {
  ARGON2ID_PROFILES,
  deriveMasterKey,
  deriveSubKey,
  fromBase64Url,
  toBase64Url,
  type Argon2idProfile,
} from '@cloudity/pass-crypto'
import type { AppVaultKind } from './types'

export const APP_VAULT_HKDF_LABEL = 'cloudity-app-vault/v1/content-key'

export const APP_VAULT_ARGON2_PROFILE: Argon2idProfile = 'mobile-low'

export function randomKdfSalt(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return toBase64Url(buf)
}

export async function deriveAppVaultKey(
  pin: string,
  kind: AppVaultKind,
  scope: string,
  kdfSaltB64u: string
): Promise<Uint8Array> {
  const salt = fromBase64Url(kdfSaltB64u)
  const mk = await deriveMasterKey({
    password: pin,
    salt,
    params: ARGON2ID_PROFILES[APP_VAULT_ARGON2_PROFILE],
  })
  const context = `${kind}:${scope}`
  const key = deriveSubKey(mk, APP_VAULT_HKDF_LABEL, context)
  mk.fill(0)
  return key
}
