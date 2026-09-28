import { describe, expect, it } from 'vitest'
import { allContactEmails, normalizeContactEmail } from './contactEmails'

describe('allContactEmails', () => {
  it('indexe le primaire et les e-mails du profil', () => {
    expect(
      allContactEmails({
        email: 'Paul@Delhomme.ovh',
        profile: {
          emails: [{ value: 'paveldelhomme@gmail.com' }, { value: 'paul@delhomme.ovh' }, 'jobs@delhomme.ovh'],
        },
      })
    ).toEqual(['paul@delhomme.ovh', 'paveldelhomme@gmail.com', 'jobs@delhomme.ovh'])
  })

  it('ignore le vide', () => {
    expect(allContactEmails({ email: '  ', profile: { emails: [{ value: '' }] } })).toEqual([])
    expect(normalizeContactEmail(' A@B.C ')).toBe('a@b.c')
  })
})
