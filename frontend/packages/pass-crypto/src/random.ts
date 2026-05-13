/**
 * CSPRNG Cloudity Pass — wrapper unique sur `crypto.getRandomValues`.
 *
 * Garanties :
 *  - jamais `Math.random` ;
 *  - jamais une PRNG seedée déterministe ailleurs que dans les tests
 *    (cf. `src/__tests__/_helpers.ts` `makeFixedRng` qui n'est utilisé que sous vitest).
 */

export type Rng = (out: Uint8Array) => Uint8Array

/** Implémentation par défaut basée sur Web Crypto. */
export const cryptoRng: Rng = (out) => {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error(
      'pass-crypto: crypto.getRandomValues indisponible (env non-Web Crypto)'
    )
  }
  // `Uint8Array<SharedArrayBuffer>` n'est pas accepté par `getRandomValues` (DOM lib récente) ;
  // notre RNG ne reçoit que des buffers `ArrayBuffer` issus de `randomBytes`/`new Uint8Array(n)`.
  globalThis.crypto.getRandomValues(out as Uint8Array<ArrayBuffer>)
  return out
}

/** Renvoie `n` octets aléatoires (utilise le RNG fourni ou le RNG cryptographique global). */
export function randomBytes(n: number, rng: Rng = cryptoRng): Uint8Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`pass-crypto: randomBytes(n) attend un entier >=0 (n=${n})`)
  }
  return rng(new Uint8Array(n))
}
