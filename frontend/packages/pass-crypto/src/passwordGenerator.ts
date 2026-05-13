/**
 * Générateur de mots de passe Cloudity Pass.
 *
 * Sécurité :
 *  - utilise **uniquement** `crypto.getRandomValues` (jamais `Math.random`) ;
 *  - tirage **uniforme** via rejection sampling (pas de modulo biaisé) ;
 *  - estime l'entropie en bits sur la base de l'alphabet effectif retenu.
 *
 * UX :
 *  - profil par défaut : 20 caractères, lower+upper+digits+symbols, pas d'ambigus.
 *  - suffisant pour battre 99% des sites tiers (~120 bits d'entropie).
 */

import { cryptoRng, type Rng } from './random'
import type { GeneratedPassword, PasswordGeneratorOptions } from './types'

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~`|'
const AMBIGUOUS = new Set('lI1O0o')

function buildAlphabet(opts: PasswordGeneratorOptions): string {
  let alpha = ''
  if (opts.lowercase ?? true) alpha += LOWER
  if (opts.uppercase ?? true) alpha += UPPER
  if (opts.digits ?? true) alpha += DIGITS
  if (opts.symbols ?? true) alpha += SYMBOLS
  if (alpha.length === 0) {
    throw new Error('pass-crypto: générateur — au moins un alphabet doit être actif')
  }
  if (opts.avoidAmbiguous) {
    alpha = Array.from(alpha)
      .filter((c) => !AMBIGUOUS.has(c))
      .join('')
  }
  return alpha
}

/**
 * Tirage entier uniforme dans `[0, max)` via rejection sampling sur 32 bits.
 * Évite le biais modulo qu'on aurait avec `randInt() % max`.
 */
function uniformInt(max: number, rng: Rng): number {
  if (max <= 0) throw new RangeError('pass-crypto: uniformInt(max) max>0 requis')
  // Plus grand multiple de `max` ≤ 2^32.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint8Array(4)
  while (true) {
    rng(buf)
    const v = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0
    if (v < limit) return v % max
  }
}

export function generatePassword(
  opts: PasswordGeneratorOptions,
  rng: Rng = cryptoRng
): GeneratedPassword {
  if (!Number.isInteger(opts.length) || opts.length < 4) {
    throw new RangeError('pass-crypto: générateur — longueur >=4 requise')
  }
  if (opts.length > 256) {
    throw new RangeError('pass-crypto: générateur — longueur >256 absurde')
  }
  const alpha = buildAlphabet(opts)
  const out = new Array<string>(opts.length)
  for (let i = 0; i < opts.length; i++) {
    out[i] = alpha[uniformInt(alpha.length, rng)]
  }
  const entropyBits = opts.length * Math.log2(alpha.length)
  return { password: out.join(''), entropyBits }
}
