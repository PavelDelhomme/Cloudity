import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64Url } from '../base64url'

describe('base64url', () => {
  it("encode/décode des bytes vides", () => {
    expect(toBase64Url(new Uint8Array(0))).toBe('')
    expect(fromBase64Url('')).toEqual(new Uint8Array(0))
  })

  it("encode/décode des séquences arbitraires (fuzz court)", () => {
    for (let len = 1; len < 200; len++) {
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes[i] = (i * 137 + 11) & 0xff
      const encoded = toBase64Url(bytes)
      // pas de padding "="
      expect(encoded).not.toMatch(/=/)
      // alphabet base64url uniquement
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/)
      const decoded = fromBase64Url(encoded)
      expect(decoded).toEqual(bytes)
    }
  })

  it('rejette les caractères invalides', () => {
    expect(() => fromBase64Url('aaa$')).toThrow(/invalide/)
  })

  it('tolère un padding "=" en entrée', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const encoded = toBase64Url(bytes)
    // ajoute artificiellement un padding
    expect(fromBase64Url(encoded + '==')).toEqual(bytes)
  })
})
