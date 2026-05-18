import { describe, it, expect } from 'vitest'
import {
  parseProtonExport,
  parseProtonImportFile,
  parseProtonCsvExport,
  parseCsvRecords,
  convertProtonToCloudity,
  ProtonImportError,
} from './protonImport'

const CSV_SAMPLE = `type,name,url,email,username,password,note,totp,vault
login,Site demo,https://demo.example,,user@demo.example,secret,,,Import
alias,Newsletter,,newsletter@alias.example.com,,,,,Import`

const VALID_EXPORT = {
  version: '1.21.0',
  userId: 'usr_42',
  encrypted: false,
  vaults: {
    'vault-aaa': {
      name: 'Personal',
      description: 'Default vault',
      items: [
        {
          itemId: 'itm_1',
          data: {
            type: 'login',
            metadata: { name: 'Acme Corp', note: 'admin account' },
            content: {
              username: 'admin@acme.example',
              password: 'super-secret',
              urls: ['https://acme.example/login', 'https://staging.acme.example'],
              totpUri:
                'otpauth://totp/Acme:admin@acme.example?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
              passkeys: [],
            },
            extraFields: [
              { fieldName: 'PIN', type: 'text', data: { content: '1234' } },
            ],
          },
        },
        {
          itemId: 'itm_2',
          data: {
            type: 'note',
            metadata: { name: 'Wifi maison', note: 'SSID: xx — pwd: yy' },
            content: {},
          },
        },
        {
          itemId: 'itm_3',
          data: {
            type: 'creditCard',
            metadata: { name: 'Visa Le Lab', note: '' },
            content: { cardNumber: '4111111111111111', expiry: '12/30' },
          },
        },
      ],
    },
    'vault-bbb': {
      name: 'Boulot',
      items: [],
    },
  },
}

describe('parseProtonExport', () => {
  it('parse un export valide en clair', () => {
    const exp = parseProtonExport(JSON.stringify(VALID_EXPORT))
    expect(exp.encrypted).toBe(false)
    expect(Object.keys(exp.vaults)).toEqual(['vault-aaa', 'vault-bbb'])
    expect(exp.vaults['vault-aaa'].items).toHaveLength(3)
    expect(exp.vaults['vault-aaa'].name).toBe('Personal')
  })

  it('refuse un export chiffré', () => {
    expect(() =>
      parseProtonExport(JSON.stringify({ ...VALID_EXPORT, encrypted: true }))
    ).toThrow(ProtonImportError)
  })

  it('refuse un JSON cassé', () => {
    expect(() => parseProtonExport('{not valid')).toThrow(ProtonImportError)
  })

  it('refuse l\'absence de "vaults"', () => {
    expect(() => parseProtonExport('{}')).toThrow(ProtonImportError)
  })

  it('reste tolérant aux champs manquants ou typés bizarrement', () => {
    const odd = {
      vaults: {
        v1: {
          name: 42, // pas une string : doit fallback vers "Importé"
          items: [
            {
              // Pas d'itemId : on en fabrique un
              data: { type: 'login', content: { username: 'x' } },
            },
            { foo: 'bar' }, // item invalide : ignoré
          ],
        },
      },
    }
    const exp = parseProtonExport(JSON.stringify(odd))
    expect(exp.vaults.v1.name).toBe('Importé')
    expect(exp.vaults.v1.items).toHaveLength(1)
    expect(exp.vaults.v1.items[0].itemId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })
})

describe('convertProtonToCloudity', () => {
  it('mappe les 3 types principaux (login / note / non géré → note)', () => {
    const exp = parseProtonExport(JSON.stringify(VALID_EXPORT))
    const out = convertProtonToCloudity(exp)
    expect(out).toHaveLength(2)

    const personal = out.find((v) => v.vaultId === 'vault-aaa')!
    expect(personal.items).toHaveLength(3)

    const login = personal.items.find((i) => i.protonType === 'login')!
    expect(login.plaintext.type).toBe('login')
    expect((login.plaintext.fields as Record<string, unknown>).title).toBe('Acme Corp')
    expect((login.plaintext.fields as Record<string, unknown>).username).toBe(
      'admin@acme.example'
    )
    expect((login.plaintext.fields as Record<string, unknown>).password).toBe('super-secret')
    expect((login.plaintext.fields as Record<string, unknown>).url).toBe(
      'https://acme.example/login'
    )
    expect((login.plaintext.fields as Record<string, unknown>).totpUri).toMatch(
      /^otpauth:\/\/totp\/Acme:admin/
    )
    expect(login.plaintext.notes).toContain('admin account')
    expect(login.plaintext.notes).toContain('URLs additionnelles')
    expect(login.plaintext.notes).toContain('PIN (text): 1234')

    const note = personal.items.find((i) => i.protonType === 'note')!
    expect(note.plaintext.type).toBe('note')
    expect(note.plaintext.notes).toContain('SSID: xx')

    const creditCard = personal.items.find((i) => i.protonType === 'creditCard')!
    expect(creditCard.plaintext.type).toBe('note')
    expect(
      (creditCard.plaintext.fields as Record<string, unknown>).protonOriginalType
    ).toBe('creditCard')
    expect(creditCard.plaintext.notes).toContain('non géré : creditCard')
    expect(creditCard.plaintext.notes).toContain('4111111111111111')
  })

  it('supporte un vault vide', () => {
    const exp = parseProtonExport(JSON.stringify(VALID_EXPORT))
    const out = convertProtonToCloudity(exp)
    const boulot = out.find((v) => v.vaultId === 'vault-bbb')!
    expect(boulot.items).toHaveLength(0)
  })

  it('convertit un CSV multi-vaults en logins Cloudity', () => {
    const exp = parseProtonCsvExport(CSV_SAMPLE)
    const out = convertProtonToCloudity(exp)
    const all = out.flatMap((v) => v.items)
    expect(all.filter((i) => i.protonType === 'login')).toHaveLength(1)
    expect(all.find((i) => i.protonType === 'alias')?.plaintext.notes).toContain(
      'newsletter@alias.example.com'
    )
  })

  it("attribue un titre par défaut quand le metadata.name est absent", () => {
    const exp = parseProtonExport(
      JSON.stringify({
        vaults: {
          v: {
            name: 'X',
            items: [
              {
                itemId: 'i',
                data: { type: 'login', metadata: {}, content: { username: 'a' } },
              },
            ],
          },
        },
      })
    )
    const out = convertProtonToCloudity(exp)
    expect((out[0].items[0].plaintext.fields as Record<string, unknown>).title).toBe(
      'Sans titre'
    )
  })
})
