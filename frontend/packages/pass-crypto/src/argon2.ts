/**
 * Argon2id (RFC 9106) — dérivation **mot de passe maître → master key (32 octets)**.
 *
 * Référence normative : docs/securite/PASS-CRYPTO.md § 2 (primitives) + § 3.3 (profils device).
 *
 * Implémentation : `hash-wasm` (Argon2id WASM, ~12 KiB gzipped, sans dépendance externe)
 *  — cf. https://github.com/Daninet/hash-wasm
 *
 * Choix `hash-wasm` plutôt que `argon2-browser` :
 *  - une seule dépendance, plus à jour ;
 *  - API streaming si jamais on déchiffre des fichiers ;
 *  - bundle plus petit pour le front.
 *
 * **Important** : le retour d'Argon2id est demandé en mode `binary` (Uint8Array),
 * jamais en mode encodé MCF (`$argon2id$...`) — le format MCF est réservé au stockage
 * côté `auth-service` (cf. `backend/auth-service/main.go` `argon2idHashBase64`).
 */

import { argon2id as argon2idWasm } from 'hash-wasm'
import type { Argon2idParams, Argon2idProfile } from './types'

/** Profils Argon2id alignés sur PASS-CRYPTO § 3.3. */
export const ARGON2ID_PROFILES: Readonly<Record<Argon2idProfile, Argon2idParams>> = {
  desktop: { t: 4, m: 262144, p: 4 }, // 256 MiB
  'mobile-high': { t: 3, m: 131072, p: 2 }, // 128 MiB
  'mobile-low': { t: 3, m: 65536, p: 2 }, // 64 MiB
}

export interface DeriveMasterKeyOptions {
  readonly password: string
  /** Salt utilisateur (16 octets recommandés). */
  readonly salt: Uint8Array
  readonly params: Argon2idParams
  /** Sortie en octets (32 = 256 bits, défaut Pass). */
  readonly hashLength?: number
}

/**
 * Dérive la **master key** depuis un mot de passe maître + salt utilisateur.
 *
 * Coût : aligné sur le profil retenu — voir PASS-CRYPTO § 3.3 pour les
 * cibles temps (~1 s desktop, ~700 ms mobile haut de gamme).
 *
 * @returns Buffer de `hashLength` octets (32 par défaut). Le caller est
 *          responsable d'effacer cette clé en RAM dès qu'il a fini.
 */
export async function deriveMasterKey(
  opts: DeriveMasterKeyOptions
): Promise<Uint8Array> {
  const { password, salt, params, hashLength = 32 } = opts
  if (password.length === 0) {
    throw new Error('pass-crypto: mot de passe maître vide')
  }
  if (salt.length < 8) {
    throw new Error('pass-crypto: salt Argon2id < 8 octets (16 recommandé)')
  }
  if (hashLength < 16 || hashLength > 64) {
    throw new RangeError('pass-crypto: hashLength doit être dans [16, 64]')
  }

  const result = await argon2idWasm({
    password,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength,
    outputType: 'binary',
  })
  return result as Uint8Array
}

/**
 * Bench rapide : mesure le temps Argon2id pour un profil. Utilisé par l'UI
 * pour proposer un upgrade silencieux quand le device peut tenir un palier
 * supérieur (cf. PASS-CRYPTO § 3.3 dernière ligne).
 *
 * @returns Durée moyenne en millisecondes sur N itérations (1 par défaut).
 */
export async function benchArgon2id(
  profile: Argon2idProfile,
  iterations = 1
): Promise<number> {
  const params = ARGON2ID_PROFILES[profile]
  const password = 'bench-cloudity-pass'
  const salt = new Uint8Array(16) // zéros — on mesure juste le temps
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    await deriveMasterKey({ password, salt, params })
  }
  return (performance.now() - start) / iterations
}
