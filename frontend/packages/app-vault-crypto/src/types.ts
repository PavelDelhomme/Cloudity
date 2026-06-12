import type { Argon2idParams } from '@cloudity/pass-crypto'

export type AppVaultKind = 'drive' | 'contacts' | 'notes' | 'photos'

export const APP_VAULT_MIME = 'application/vnd.cloudity.vault+json;v=1'

/** Enveloppe stockée côté serveur (opaque pour le backend). */
export type AppVaultEnvelopeV1 = {
  v: 1
  alg: 'xchacha20poly1305'
  kind: AppVaultKind
  scope: string
  resourceId: string
  nonce: string
  ct: string
}

export type AppVaultKdfDescriptor = {
  alg: 'argon2id'
  profile: 'mobile-low' | 'mobile-high' | 'desktop'
  salt: string
  params: Argon2idParams
}
