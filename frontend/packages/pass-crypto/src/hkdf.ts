/**
 * HKDF-SHA-256 (RFC 5869) — dérivation de sous-clés depuis la master key.
 *
 * Référence normative : docs/securite/PASS-CRYPTO.md § 3 (hiérarchie des clés)
 * + RFC 5869.
 *
 * Implémentation : `@noble/hashes` (pure-JS, audited, sans WASM).
 * https://github.com/paulmillr/noble-hashes
 */

import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'

/**
 * Étiquettes HKDF stables alignées sur PASS-CRYPTO § 3 :
 *
 *   VK : "cloudity-pass/v1/vault-key"
 *   WK : "cloudity-pass/v1/wrap-key"
 *   IK : "cloudity-pass/v1/index-key"   (Phase 2, recherche locale)
 *
 * Le `info` HKDF combine l'étiquette avec un identifiant de contexte
 * (souvent `vault_id`) pour produire des clés indépendantes par vault.
 */
export const HKDF_LABELS = {
  vaultKey: 'cloudity-pass/v1/vault-key',
  wrapKey: 'cloudity-pass/v1/wrap-key',
  indexKey: 'cloudity-pass/v1/index-key',
} as const

const TEXT_ENCODER = new TextEncoder()

function makeInfo(label: string, context: string | Uint8Array): Uint8Array {
  const labelBytes = TEXT_ENCODER.encode(label + ':')
  const ctxBytes = typeof context === 'string' ? TEXT_ENCODER.encode(context) : context
  const out = new Uint8Array(labelBytes.length + ctxBytes.length)
  out.set(labelBytes, 0)
  out.set(ctxBytes, labelBytes.length)
  return out
}

/**
 * Dérive une sous-clé `keyLen` octets depuis `masterKey` avec HKDF-SHA-256.
 *
 * @param masterKey Master key issue d'Argon2id.
 * @param label Une des étiquettes `HKDF_LABELS` ou un label custom.
 * @param context Contexte de dérivation (typiquement `vault_id` ou `item_id`).
 * @param keyLen Taille de la clé dérivée (32 par défaut).
 */
export function deriveSubKey(
  masterKey: Uint8Array,
  label: string,
  context: string | Uint8Array,
  keyLen = 32
): Uint8Array {
  if (keyLen < 16 || keyLen > 64) {
    throw new RangeError('pass-crypto: keyLen HKDF doit être dans [16, 64]')
  }
  // Salt vide ⇒ HKDF-Extract = HMAC(zeros, IKM) — c'est le comportement par défaut
  // du @noble/hashes/hkdf quand on omet `salt`. On l'explicite à zéros pour rester
  // déterministe (un vault donné produit toujours la même VK).
  const salt = new Uint8Array(32)
  return hkdf(sha256, masterKey, salt, makeInfo(label, context), keyLen)
}

/** Helper : dérive la clé de vault (VK) depuis MK + vault_id. */
export function deriveVaultKey(
  masterKey: Uint8Array,
  vaultId: string
): Uint8Array {
  return deriveSubKey(masterKey, HKDF_LABELS.vaultKey, vaultId)
}

/** Helper : dérive la wrap key (WK) depuis MK + vault_id (Phase enrôlement). */
export function deriveWrapKey(
  masterKey: Uint8Array,
  vaultId: string
): Uint8Array {
  return deriveSubKey(masterKey, HKDF_LABELS.wrapKey, vaultId)
}
