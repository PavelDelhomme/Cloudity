/**
 * Types publics @cloudity/pass-crypto.
 *
 * Référence normative : docs/securite/PASS-CRYPTO.md (§ 2 primitives, § 3 hiérarchie de clés,
 * § 4 format binaire EnvelopeV1).
 */

export type Argon2idProfile = 'desktop' | 'mobile-high' | 'mobile-low'

export interface Argon2idParams {
  /** Itérations Argon2id (`t`). */
  readonly t: number
  /** Mémoire en KiB (`m`). 262144 = 256 MiB (desktop), 131072 = 128 MiB (mobile-high). */
  readonly m: number
  /** Parallélisme (`p`). */
  readonly p: number
}

export interface KdfDescriptor {
  readonly name: 'argon2id'
  readonly t: number
  readonly m: number
  readonly p: number
}

/**
 * Enveloppe binaire d'un item Pass (format `v: 1`).
 *
 * Sérialisation : CBOR (RFC 8949) puis base64url sans padding.
 * Le serveur ne lit jamais ce blob — il étiquette uniquement la `format_version`.
 */
export interface EnvelopeV1 {
  readonly v: 1
  readonly alg: 'xchacha20poly1305'
  readonly kdf: KdfDescriptor
  /** Optionnel : présent si l'item est partageable (Phase v0.2). */
  readonly kem?: 'x25519+ml-kem-768'
  /** Salt Argon2id (16 octets). Public — un salt n'est pas un secret. */
  readonly salt_user: Uint8Array
  /** Identifiant du vault (UUID v4 sérialisé en bytes ou string canonique). */
  readonly vault_id: string
  /** Identifiant de l'item (UUID v4). */
  readonly item_id: string
  /** `IK_item` chiffrée sous `VK` (XChaCha20-Poly1305). */
  readonly wrap: Uint8Array
  /** Payload chiffré sous `IK_item` (XChaCha20-Poly1305). */
  readonly ct: Uint8Array
  /** Nonce 24 octets pour `wrap`. */
  readonly nonce_w: Uint8Array
  /** Nonce 24 octets pour `ct`. */
  readonly nonce_c: Uint8Array
  /**
   * AAD canonique liée à `item_id`, `vault_id`, `v`, `alg`. Empêche la
   * réutilisation cross-item d'un ciphertext (cf. PASS-CRYPTO § 4).
   */
  readonly aad: Uint8Array
}

/**
 * Schéma de l'item *en clair* (avant chiffrement). Versionné séparément
 * de l'enveloppe pour permettre l'évolution du format applicatif sans
 * bumper la crypto.
 */
export interface ItemPlaintextV1 {
  readonly schema: 1
  readonly type: ItemType
  readonly fields: Record<string, unknown>
  /** Notes libres (markdown plat). */
  readonly notes?: string
  /** Tags utilisateur (filtrage local). */
  readonly tags?: readonly string[]
}

export type ItemType =
  | 'login'
  | 'note'
  | 'card'
  | 'identity'
  | 'totp'
  | 'ssh-key'

/** Options du générateur de mots de passe. */
export interface PasswordGeneratorOptions {
  readonly length: number
  readonly lowercase?: boolean
  readonly uppercase?: boolean
  readonly digits?: boolean
  readonly symbols?: boolean
  /** Évite les caractères ambigus (l, 1, I, O, 0). */
  readonly avoidAmbiguous?: boolean
}

/** Résultat d'une génération : mot de passe + entropie estimée (bits). */
export interface GeneratedPassword {
  readonly password: string
  readonly entropyBits: number
}
