import { describe, expect, it } from 'vitest'
import { generatePassword } from '../passwordGenerator'
import { makeFixedRng } from './_helpers'

describe('generatePassword', () => {
  it('refuse une longueur trop courte', () => {
    expect(() => generatePassword({ length: 3 })).toThrow(/longueur/)
  })

  it('refuse une longueur absurde', () => {
    expect(() => generatePassword({ length: 1024 })).toThrow(/longueur/)
  })

  it('refuse si tous les alphabets sont désactivés', () => {
    expect(() =>
      generatePassword({
        length: 12,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      })
    ).toThrow(/alphabet/)
  })

  it('produit un mot de passe de la bonne longueur, dans l’alphabet attendu', () => {
    const { password, entropyBits } = generatePassword(
      { length: 20, lowercase: true, uppercase: true, digits: true, symbols: false },
      makeFixedRng()
    )
    expect(password).toHaveLength(20)
    expect(password).toMatch(/^[A-Za-z0-9]+$/)
    // 26+26+10 = 62 caractères → log2(62)*20 ≈ 119 bits
    expect(entropyBits).toBeGreaterThan(115)
    expect(entropyBits).toBeLessThan(125)
  })

  it('exclut les caractères ambigus si demandé', () => {
    for (let i = 0; i < 50; i++) {
      const { password } = generatePassword({
        length: 32,
        avoidAmbiguous: true,
      })
      expect(password).not.toMatch(/[lI1O0o]/)
    }
  })

  it('avec un RNG fixé, la sortie est reproductible', () => {
    const a = generatePassword({ length: 16 }, makeFixedRng(42))
    const b = generatePassword({ length: 16 }, makeFixedRng(42))
    expect(a.password).toBe(b.password)
  })
})
