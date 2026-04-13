import { describe, it, expect } from 'vitest'
import {
  splitCsvLine,
  parseContactsFromCsv,
  parseContactsFromJson,
  parseContactsFromHtml,
  detectAndParseContacts,
} from './contactImport'

describe('contactImport', () => {
  it('splitCsvLine gère les guillemets', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
  })

  it('parseContactsFromCsv style Google (en-têtes anglais)', () => {
    const csv = [
      'Name,Given Name,Family Name,E-mail 1 - Value,Phone 1 - Value',
      '"Dupont, Jean",Jean,Dupont,jean.dupont@exemple.fr,+33 6 00 00 00 01',
      ',,,bad-email,',
      ',Marie,Martin,marie@exemple.fr,',
    ].join('\n')
    const r = parseContactsFromCsv(csv)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ email: 'jean.dupont@exemple.fr', name: 'Jean Dupont' })
    expect(r[1]).toMatchObject({ email: 'marie@exemple.fr', name: 'Marie Martin' })
  })

  it('parseContactsFromJson tableau simple', () => {
    const j = JSON.stringify([
      { name: 'A', email: 'a@test.com', phone: '01' },
      { email: 'not-an-email' },
    ])
    const r = parseContactsFromJson(j)
    expect(r).toHaveLength(1)
    expect(r[0].email).toBe('a@test.com')
  })

  it('parseContactsFromHtml tableau', () => {
    const html = `<table>
      <tr><th>Name</th><th>Email</th></tr>
      <tr><td>Test User</td><td>html@test.com</td></tr>
    </table>`
    const r = parseContactsFromHtml(html)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ email: 'html@test.com', name: 'Test User' })
  })

  it('detectAndParseContacts par extension', () => {
    const csv = 'Name,Email\nX,x@y.com\n'
    const d = detectAndParseContacts('contacts.csv', csv)
    expect(d.format).toBe('csv')
    expect(d.contacts).toHaveLength(1)
  })
})
