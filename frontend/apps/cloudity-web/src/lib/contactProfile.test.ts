import { describe, expect, it } from 'vitest'
import {
  composeDisplayName,
  formatContactAddress,
  formatPhoneValue,
  huberaMapsDeepLink,
  huberaMapsWebLink,
  primaryEmail,
  profileFromLegacy,
} from './contactProfile'

describe('contactProfile', () => {
  it('composeDisplayName', () => {
    expect(
      composeDisplayName({ given_name: 'Ada', family_name: 'Lovelace', prefix: 'Mme' })
    ).toBe('Mme Ada Lovelace')
  })

  it('formatPhoneValue FR', () => {
    expect(formatPhoneValue({ label: 'mobile', value: '0612345678', country: 'FR' })).toBe(
      '+33612345678'
    )
  })

  it('primaryEmail from profile', () => {
    expect(
      primaryEmail({ emails: [{ label: 'work', value: 'a@b.co' }] }, 'legacy@x.com')
    ).toBe('a@b.co')
  })

  it('profileFromLegacy splits name', () => {
    const p = profileFromLegacy('Jean Dupont', 'j@d.fr', '0600000000')
    expect(p.given_name).toBe('Jean')
    expect(p.family_name).toBe('Dupont')
  })

  it('formatContactAddress + Maps deep link', () => {
    expect(
      formatContactAddress({
        label: 'home',
        street: '12 rue de la Paix',
        postal_code: '75002',
        city: 'Paris',
        country: 'France',
      })
    ).toBe('12 rue de la Paix, 75002 Paris, France')
    expect(huberaMapsDeepLink('12 rue de la Paix, Paris')).toBe(
      'hubera-maps://?q=12%20rue%20de%20la%20Paix%2C%20Paris'
    )
    expect(huberaMapsWebLink('Lyon')).toBe('https://maps.hubera.cloud/?q=Lyon')
    expect(huberaMapsDeepLink('')).toBe('')
  })
})
