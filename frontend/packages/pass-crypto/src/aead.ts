/**
 * XChaCha20-Poly1305 (IETF) — AEAD pour Cloudity Pass.
 *
 * Référence normative : docs/securite/PASS-CRYPTO.md § 2 (primitives).
 *
 * Implémentation : `@noble/ciphers/chacha` (pure-JS, audited, sans WASM).
 * https://github.com/paulmillr/noble-ciphers
 *
 * Notes :
 *  - **Nonce 192 bits aléatoires** (24 octets) — pas de risque de collision
 *    pratique même sur des millions de chiffrements par clé (cf. PASS-CRYPTO § 2).
 *  - L'AAD est canonique et inclut `item_id`, `vault_id`, `v`, `alg` — empêche
 *    la réutilisation cross-item d'un ciphertext.
 *  - Toute altération du ciphertext ou de l'AAD ⇒ erreur de déchiffrement
 *    (vérification Poly1305 native).
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha'

export const NONCE_LEN = 24
export const KEY_LEN = 32
export const TAG_LEN = 16

export interface SealInput {
  readonly key: Uint8Array
  readonly nonce: Uint8Array
  readonly plaintext: Uint8Array
  readonly aad: Uint8Array
}

export interface OpenInput {
  readonly key: Uint8Array
  readonly nonce: Uint8Array
  readonly ciphertext: Uint8Array
  readonly aad: Uint8Array
}

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_LEN) {
    throw new Error(
      `pass-crypto: clé XChaCha20 invalide (${key.length} octets, attendu ${KEY_LEN})`
    )
  }
}

function assertNonce(nonce: Uint8Array): void {
  if (nonce.length !== NONCE_LEN) {
    throw new Error(
      `pass-crypto: nonce XChaCha20 invalide (${nonce.length} octets, attendu ${NONCE_LEN})`
    )
  }
}

/** Chiffre `plaintext` avec XChaCha20-Poly1305. Renvoie ciphertext || tag (16 octets) collés. */
export function seal({ key, nonce, plaintext, aad }: SealInput): Uint8Array {
  assertKey(key)
  assertNonce(nonce)
  const cipher = xchacha20poly1305(key, nonce, aad)
  return cipher.encrypt(plaintext)
}

/**
 * Déchiffre un ciphertext XChaCha20-Poly1305. Lance une erreur si l'auth tag
 * est invalide (modification détectée du ciphertext, du nonce, de la clé,
 * ou de l'AAD).
 */
export function open({ key, nonce, ciphertext, aad }: OpenInput): Uint8Array {
  assertKey(key)
  assertNonce(nonce)
  const cipher = xchacha20poly1305(key, nonce, aad)
  return cipher.decrypt(ciphertext)
}
