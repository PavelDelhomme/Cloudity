/**
 * Encodage base64url (RFC 4648 § 5) **sans padding** — utilisé pour
 * `pass_items.ciphertext` côté serveur (chaîne UTF-8 transportable).
 *
 * Implémentation pure, sans dépendance, compatible navigateur + Node 20+.
 */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const DECODE_TABLE: Int8Array = (() => {
  const t = new Int8Array(256).fill(-1)
  for (let i = 0; i < ALPHA.length; i++) {
    t[ALPHA.charCodeAt(i)] = i
  }
  return t
})()

export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out +=
      ALPHA[a >> 2] +
      ALPHA[((a & 0x03) << 4) | (b >> 4)] +
      ALPHA[((b & 0x0f) << 2) | (c >> 6)] +
      ALPHA[c & 0x3f]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const a = bytes[i]
    out += ALPHA[a >> 2] + ALPHA[(a & 0x03) << 4]
  } else if (rem === 2) {
    const a = bytes[i]
    const b = bytes[i + 1]
    out +=
      ALPHA[a >> 2] +
      ALPHA[((a & 0x03) << 4) | (b >> 4)] +
      ALPHA[(b & 0x0f) << 2]
  }
  return out
}

export function fromBase64Url(s: string): Uint8Array {
  // tolère le padding "=" si quelqu'un nous l'envoie
  const clean = s.replace(/=+$/, '')
  const rem = clean.length % 4
  if (rem === 1) {
    throw new Error('pass-crypto: chaîne base64url invalide (longueur)')
  }
  const outLen = Math.floor((clean.length * 6) / 8)
  const out = new Uint8Array(outLen)
  let oi = 0
  let buf = 0
  let bits = 0
  for (let i = 0; i < clean.length; i++) {
    const v = DECODE_TABLE[clean.charCodeAt(i)]
    if (v < 0) {
      throw new Error('pass-crypto: caractère base64url invalide')
    }
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[oi++] = (buf >> bits) & 0xff
    }
  }
  return out
}
