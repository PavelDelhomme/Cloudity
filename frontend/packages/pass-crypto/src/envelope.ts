/**
 * Format `EnvelopeV1` — sérialisation CBOR + base64url.
 *
 * Référence normative : docs/securite/PASS-CRYPTO.md § 4 (format binaire).
 *
 * Côté serveur (`backend/passwords-service`), `pass_items.ciphertext` est une
 * chaîne UTF-8 : on encode l'enveloppe complète en CBOR puis en base64url
 * sans padding.
 */

import { Decoder, Encoder } from 'cbor-x'
import { fromBase64Url, toBase64Url } from './base64url'
import { open, seal } from './aead'
import { deriveSubKey, deriveVaultKey, HKDF_LABELS } from './hkdf'
import { randomBytes, type Rng } from './random'
import type {
  EnvelopeV1,
  ItemPlaintextV1,
  KdfDescriptor,
} from './types'

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true })

// cbor-x sérialise les Uint8Array en `bytes` natifs CBOR (major type 2) — interopérable.
// `useRecords: false` côté décodage : on évite les "records" dynamiques (qui nécessiteraient
// une coordination encodeur/décodeur) et on retombe sur un objet plain compatible n'importe
// quel décodeur CBOR (RFC 8949).
const CBOR_DECODER = new Decoder({ useRecords: false })
const CBOR_ENCODER = new Encoder({ useRecords: false })

function cborEncode(value: unknown): Uint8Array {
  return CBOR_ENCODER.encode(value)
}

function cborDecode<T>(bytes: Uint8Array): T {
  return CBOR_DECODER.decode(bytes) as T
}

/**
 * Construit l'AAD canonique d'un item : `vault_id || ":" || item_id || ":" || v || ":" || alg`.
 *
 * Cette AAD est passée à l'AEAD (Poly1305) et incluse en clair dans l'enveloppe
 * via le champ `aad` (ce qui permet de rejouer la vérification au décodage).
 */
function buildAad(envelope: Pick<EnvelopeV1, 'vault_id' | 'item_id' | 'v' | 'alg'>): Uint8Array {
  return TEXT_ENCODER.encode(
    `${envelope.vault_id}:${envelope.item_id}:v${envelope.v}:${envelope.alg}`
  )
}

export interface EncryptItemOptions {
  readonly vaultId: string
  readonly itemId: string
  readonly vaultKey: Uint8Array
  readonly plaintext: ItemPlaintextV1
  readonly kdf: KdfDescriptor
  readonly saltUser: Uint8Array
  /** Optionnel : RNG injectable (tests vecteurs). Par défaut : crypto.getRandomValues. */
  readonly rng?: Rng
}

/** Chiffre un item : produit l'enveloppe complète (objet TS), puis encode en base64url CBOR. */
export function buildEnvelope(opts: EncryptItemOptions): EnvelopeV1 {
  const rng = opts.rng
  // 1. Génère IK_item (clé fraîche par item — cf. PASS-CRYPTO § 3.1).
  const ikItem = randomBytes(32, rng)
  // 2. Nonces aléatoires.
  const nonceC = randomBytes(24, rng)
  const nonceW = randomBytes(24, rng)
  // 3. AAD canonique (header signé).
  const aad = buildAad({
    vault_id: opts.vaultId,
    item_id: opts.itemId,
    v: 1,
    alg: 'xchacha20poly1305',
  })
  // 4. Sérialise le plaintext applicatif en CBOR.
  const plainBytes = cborEncode(opts.plaintext)
  // 5. Chiffre le payload sous IK_item.
  const ct = seal({ key: ikItem, nonce: nonceC, plaintext: plainBytes, aad })
  // 6. Chiffre IK_item sous VK (champ `wrap`). AAD du wrap : "wrap:" + AAD principale.
  const wrapAad = TEXT_ENCODER.encode('wrap:' + TEXT_DECODER.decode(aad))
  const wrap = seal({ key: opts.vaultKey, nonce: nonceW, plaintext: ikItem, aad: wrapAad })
  // 7. Efface IK_item de la RAM dès que possible.
  ikItem.fill(0)

  return {
    v: 1,
    alg: 'xchacha20poly1305',
    kdf: opts.kdf,
    salt_user: opts.saltUser,
    vault_id: opts.vaultId,
    item_id: opts.itemId,
    wrap,
    ct,
    nonce_w: nonceW,
    nonce_c: nonceC,
    aad,
  }
}

/** Encode une enveloppe en CBOR puis en base64url sans padding (transport DB). */
export function encodeEnvelope(env: EnvelopeV1): string {
  return toBase64Url(cborEncode(env))
}

/** Décode une chaîne base64url ⇢ CBOR ⇢ EnvelopeV1. Lance si le format est mauvais. */
export function decodeEnvelope(encoded: string): EnvelopeV1 {
  const cbor = fromBase64Url(encoded)
  const env = cborDecode<EnvelopeV1>(cbor)
  if (env?.v !== 1) {
    throw new Error(`pass-crypto: version d'enveloppe non supportée (${env?.v})`)
  }
  if (env.alg !== 'xchacha20poly1305') {
    throw new Error(`pass-crypto: algorithme inconnu (${env.alg})`)
  }
  return env
}

export interface DecryptItemOptions {
  readonly envelope: EnvelopeV1
  readonly vaultKey: Uint8Array
}

/** Déchiffre un item depuis son enveloppe. Lance si l'auth tag est invalide. */
export function openEnvelope(opts: DecryptItemOptions): ItemPlaintextV1 {
  const env = opts.envelope
  // Étape 1 : retrouver IK_item via VK.
  const wrapAad = TEXT_ENCODER.encode('wrap:' + TEXT_DECODER.decode(env.aad))
  const ikItem = open({
    key: opts.vaultKey,
    nonce: env.nonce_w,
    ciphertext: env.wrap,
    aad: wrapAad,
  })
  try {
    // Étape 2 : déchiffrer le payload.
    const plainBytes = open({
      key: ikItem,
      nonce: env.nonce_c,
      ciphertext: env.ct,
      aad: env.aad,
    })
    const plain = cborDecode<ItemPlaintextV1>(plainBytes)
    if (plain?.schema !== 1) {
      throw new Error(`pass-crypto: schéma item non supporté (${plain?.schema})`)
    }
    return plain
  } finally {
    ikItem.fill(0)
  }
}

/** Helper haut-niveau : MK + vaultId + plaintext → ciphertext base64url. */
export function encryptItemForVault(args: {
  readonly masterKey: Uint8Array
  readonly vaultId: string
  readonly itemId: string
  readonly plaintext: ItemPlaintextV1
  readonly kdf: KdfDescriptor
  readonly saltUser: Uint8Array
  readonly rng?: Rng
}): string {
  const vk = deriveVaultKey(args.masterKey, args.vaultId)
  try {
    const env = buildEnvelope({ ...args, vaultKey: vk })
    return encodeEnvelope(env)
  } finally {
    vk.fill(0)
  }
}

/** Helper haut-niveau : MK + vaultId + ciphertext base64url → plaintext. */
export function decryptItemFromVault(args: {
  readonly masterKey: Uint8Array
  readonly vaultId: string
  readonly encoded: string
}): ItemPlaintextV1 {
  const env = decodeEnvelope(args.encoded)
  if (env.vault_id !== args.vaultId) {
    throw new Error('pass-crypto: vault_id mismatch (ciphertext appartient à un autre coffre)')
  }
  const vk = deriveVaultKey(args.masterKey, args.vaultId)
  try {
    return openEnvelope({ envelope: env, vaultKey: vk })
  } finally {
    vk.fill(0)
  }
}

// Garde la fonction exportée pour usage externe (debug / migrations).
export { deriveSubKey, HKDF_LABELS }
