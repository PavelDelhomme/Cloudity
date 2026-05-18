import { describe, it, expect } from 'vitest'
import { effectiveAliasHostSuffix, resolveAliasEmailInput } from './mailAlias'

describe('mailAlias', () => {
  it('resolveAliasEmailInput complète le suffixe', () => {
    expect(resolveAliasEmailInput('newsletter', 'alias.exemple.ovh')).toBe(
      'newsletter@alias.exemple.ovh'
    )
  })

  it('effectiveAliasHostSuffix dérive du domaine boîte', () => {
    expect(effectiveAliasHostSuffix(undefined, 'a@cloudity.local')).toBe('alias.cloudity.local')
  })
})
