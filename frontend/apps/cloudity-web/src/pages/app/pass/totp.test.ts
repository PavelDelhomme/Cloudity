import { describe, it, expect } from 'vitest'
import {
  base32Decode,
  generateTotp,
  parseOtpauthUri,
  totpSecondsRemaining,
} from './totp'

/**
 * Vecteurs de test issus de la RFC 6238 Appendix B (test values).
 * Secret ASCII : "12345678901234567890" → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
 *
 * Sec.   T (hex)             SHA-1 TOTP   SHA-256 TOTP   SHA-512 TOTP
 *  59    0000000000000001   94287082     46119246       90693936
 *  1111111109     00000000023523EC   07081804     68084774       25091201
 *  1111111111     00000000023523ED   14050471     67062674       99943326
 */

describe('base32Decode', () => {
  it('décode "MFRGG===" → "abc"', () => {
    expect(new TextDecoder().decode(base32Decode('MFRGG==='))).toBe('abc')
  })

  it('tolère minuscules et espaces', () => {
    const a = base32Decode('JBSWY3DPEHPK3PXP')
    const b = base32Decode('jbsw y3dp ehpk 3pxp')
    expect(b).toEqual(a)
  })

  it('rejette les caractères invalides', () => {
    expect(() => base32Decode('!!!')).toThrow(/Invalid base32 character/)
  })

  it('renvoie un buffer vide pour entrée vide', () => {
    expect(base32Decode('')).toEqual(new Uint8Array(0))
  })
})

describe('generateTotp — vecteurs RFC 6238 Appendix B', () => {
  // Secret RFC : ASCII "12345678901234567890", encodé base32.
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('SHA-1 @ T=59  →  94287082', async () => {
    const code = await generateTotp(
      { secret: RFC_SECRET, algorithm: 'SHA-1', digits: 8, period: 30 },
      59 * 1000
    )
    expect(code).toBe('94287082')
  })

  it('SHA-1 @ T=1111111109  →  07081804', async () => {
    const code = await generateTotp(
      { secret: RFC_SECRET, algorithm: 'SHA-1', digits: 8, period: 30 },
      1111111109 * 1000
    )
    expect(code).toBe('07081804')
  })

  it('SHA-1 @ T=1111111111  →  14050471', async () => {
    const code = await generateTotp(
      { secret: RFC_SECRET, algorithm: 'SHA-1', digits: 8, period: 30 },
      1111111111 * 1000
    )
    expect(code).toBe('14050471')
  })

  it('SHA-1 6 chiffres @ T=59 → "287082"', async () => {
    const code = await generateTotp(
      { secret: RFC_SECRET, algorithm: 'SHA-1', digits: 6, period: 30 },
      59 * 1000
    )
    expect(code).toBe('287082')
  })

  it('SHA-256 @ T=59  →  46119246', async () => {
    // RFC 6238 utilise un secret SHA-256 plus long ("12345678901234567890123456789012")
    const SECRET_SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA'
    const code = await generateTotp(
      { secret: SECRET_SHA256, algorithm: 'SHA-256', digits: 8, period: 30 },
      59 * 1000
    )
    expect(code).toBe('46119246')
  })

  it('refuse digits = 5 ou 11', async () => {
    await expect(
      generateTotp({ secret: 'JBSWY3DPEHPK3PXP', digits: 5 } as unknown as never, 0)
    ).rejects.toThrow(/digits/)
    await expect(
      generateTotp({ secret: 'JBSWY3DPEHPK3PXP', digits: 11 } as unknown as never, 0)
    ).rejects.toThrow(/digits/)
  })
})

describe('totpSecondsRemaining', () => {
  it('30 - (now % 30) sur la période par défaut', () => {
    expect(totpSecondsRemaining({ secret: 'X' }, 1_000)).toBe(29) // (1 % 30) = 1, 30-1 = 29
    expect(totpSecondsRemaining({ secret: 'X' }, 0)).toBe(30)
    expect(totpSecondsRemaining({ secret: 'X' }, 29_000)).toBe(1)
    expect(totpSecondsRemaining({ secret: 'X' }, 30_000)).toBe(30)
  })
})

describe('parseOtpauthUri', () => {
  it('parse une URI Google Authenticator standard', () => {
    const p = parseOtpauthUri(
      'otpauth://totp/Acme:user@example.org?secret=JBSWY3DPEHPK3PXP&issuer=Acme&algorithm=SHA1&digits=6&period=30'
    )
    expect(p).not.toBeNull()
    expect(p!.type).toBe('totp')
    expect(p!.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(p!.issuer).toBe('Acme')
    expect(p!.accountName).toBe('user@example.org')
    expect(p!.algorithm).toBe('SHA-1')
    expect(p!.digits).toBe(6)
    expect(p!.period).toBe(30)
  })

  it('mappe SHA256 / SHA-512 vers Web Crypto SHA-XXX', () => {
    expect(
      parseOtpauthUri('otpauth://totp/A?secret=ABCDABCD&algorithm=SHA256')!.algorithm
    ).toBe('SHA-256')
    expect(
      parseOtpauthUri('otpauth://totp/A?secret=ABCDABCD&algorithm=SHA-512')!.algorithm
    ).toBe('SHA-512')
  })

  it('renvoie null pour une URI non otpauth', () => {
    expect(parseOtpauthUri('https://example.org/?secret=x')).toBeNull()
    expect(parseOtpauthUri('not a url')).toBeNull()
    expect(parseOtpauthUri('otpauth://something/X?secret=x')).toBeNull()
  })

  it('renvoie null si secret manquant', () => {
    expect(parseOtpauthUri('otpauth://totp/Acme:user@example.org')).toBeNull()
  })

  it('parse HOTP avec counter', () => {
    const p = parseOtpauthUri(
      'otpauth://hotp/Acme:user?secret=JBSWY3DPEHPK3PXP&counter=42'
    )
    expect(p!.type).toBe('hotp')
    expect(p!.counter).toBe(42)
  })
})
