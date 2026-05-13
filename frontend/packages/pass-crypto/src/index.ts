/**
 * @cloudity/pass-crypto — point d'entrée public.
 *
 * Spec normative : docs/securite/PASS-CRYPTO.md.
 *
 * Garantie zero-access : aucune clé (MK, VK, IK_item) n'est jamais exposée
 * au serveur. Le caller est responsable d'effacer (`.fill(0)`) ses clés
 * sensibles dès qu'il a fini.
 */

// Types publics
export type {
  Argon2idParams,
  Argon2idProfile,
  EnvelopeV1,
  GeneratedPassword,
  ItemPlaintextV1,
  ItemType,
  KdfDescriptor,
  PasswordGeneratorOptions,
} from './types'

// Primitives bas niveau
export { ARGON2ID_PROFILES, benchArgon2id, deriveMasterKey } from './argon2'
export { deriveSubKey, deriveVaultKey, deriveWrapKey, HKDF_LABELS } from './hkdf'
export { open as openAead, seal as sealAead, KEY_LEN, NONCE_LEN, TAG_LEN } from './aead'
export { fromBase64Url, toBase64Url } from './base64url'
export { cryptoRng, randomBytes } from './random'
export type { Rng } from './random'

// Format EnvelopeV1
export {
  buildEnvelope,
  decodeEnvelope,
  decryptItemFromVault,
  encodeEnvelope,
  encryptItemForVault,
  openEnvelope,
} from './envelope'

// Générateur
export { generatePassword } from './passwordGenerator'
