import { openAead, randomBytes, sealAead, toBase64Url, fromBase64Url } from '@cloudity/pass-crypto'
import type { AppVaultEnvelopeV1, AppVaultKind } from './types'

const TEXT_ENCODER = new TextEncoder()

function buildAad(kind: AppVaultKind, scope: string, resourceId: string): Uint8Array {
  return TEXT_ENCODER.encode(`cloudity-app-vault/v1/aad:${kind}:${scope}:${resourceId}`)
}

export function encryptAppVaultPayload(
  key: Uint8Array,
  kind: AppVaultKind,
  scope: string,
  resourceId: string,
  plaintext: Uint8Array
): AppVaultEnvelopeV1 {
  const nonce = randomBytes(24)
  const aad = buildAad(kind, scope, resourceId)
  const ct = sealAead({ key, nonce, plaintext, aad })
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    kind,
    scope,
    resourceId,
    nonce: toBase64Url(nonce),
    ct: toBase64Url(ct),
  }
}

export function decryptAppVaultPayload(
  key: Uint8Array,
  envelope: AppVaultEnvelopeV1
): Uint8Array {
  if (envelope.v !== 1 || envelope.alg !== 'xchacha20poly1305') {
    throw new Error('app-vault-crypto: format d’enveloppe non supporté')
  }
  const aad = buildAad(envelope.kind, envelope.scope, envelope.resourceId)
  return openAead({
    key,
    nonce: fromBase64Url(envelope.nonce),
    ciphertext: fromBase64Url(envelope.ct),
    aad,
  })
}

export function encodeEnvelope(envelope: AppVaultEnvelopeV1): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(envelope))
}

export function decodeEnvelope(bytes: Uint8Array): AppVaultEnvelopeV1 {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AppVaultEnvelopeV1>
  if (
    parsed.v !== 1 ||
    parsed.alg !== 'xchacha20poly1305' ||
    !parsed.kind ||
    !parsed.scope ||
    !parsed.resourceId ||
    !parsed.nonce ||
    !parsed.ct
  ) {
    throw new Error('app-vault-crypto: enveloppe invalide')
  }
  return parsed as AppVaultEnvelopeV1
}

export function encryptJsonPayload<T>(
  key: Uint8Array,
  kind: AppVaultKind,
  scope: string,
  resourceId: string,
  payload: T
): AppVaultEnvelopeV1 {
  const plain = TEXT_ENCODER.encode(JSON.stringify(payload))
  return encryptAppVaultPayload(key, kind, scope, resourceId, plain)
}

export function decryptJsonPayload<T>(
  key: Uint8Array,
  envelope: AppVaultEnvelopeV1
): T {
  const plain = decryptAppVaultPayload(key, envelope)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
