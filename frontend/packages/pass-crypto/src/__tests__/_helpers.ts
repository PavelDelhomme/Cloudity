/**
 * Helpers de test — RNG déterministe, profils Argon2id ultra-rapides pour vitest.
 *
 * **Jamais** importer ce fichier en runtime applicatif : c'est strictement réservé
 * aux tests qui ont besoin de vecteurs reproductibles ou de paramètres de coût
 * négligeables. Le code production utilise `cryptoRng` + `ARGON2ID_PROFILES`.
 */

import type { Argon2idParams } from '../types'
import type { Rng } from '../random'

/**
 * Profil Argon2id "test" : 1 itération, 8 KiB, parallelism 1.
 *
 * Calibré pour ~50 ms sur un laptop modeste — totalement insuffisant en prod
 * mais identique fonctionnellement (même fonction, même format de sortie).
 */
export const ARGON2ID_TEST: Argon2idParams = { t: 1, m: 8, p: 1 }

/**
 * RNG pseudo-déterministe (xorshift32) — uniquement pour vecteurs de test.
 * **Pas cryptographique.** Sortie reproductible si on garde le même seed.
 */
export function makeFixedRng(seed = 0xc1ce_0001): Rng {
  let state = seed >>> 0
  return (out: Uint8Array) => {
    for (let i = 0; i < out.length; i++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      out[i] = state & 0xff
    }
    return out
  }
}
