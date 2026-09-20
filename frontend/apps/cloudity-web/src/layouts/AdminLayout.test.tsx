import { describe, expect, it } from 'vitest'
import { buildAdminDocumentTitle } from './AdminLayout'

describe('buildAdminDocumentTitle', () => {
  it('tableau de bord admin : Administration — Hubera', () => {
    expect(buildAdminDocumentTitle('/4dm1n', undefined)).toBe('Administration — Hubera')
    expect(buildAdminDocumentTitle('/4dm1n/', undefined)).toBe('Administration — Hubera')
  })

  it('sous-pages : section — Hubera', () => {
    expect(buildAdminDocumentTitle('/4dm1n/tenants', undefined)).toBe('Tenants — Hubera')
    expect(buildAdminDocumentTitle('/4dm1n/users', undefined)).toBe('Utilisateurs — Hubera')
    expect(buildAdminDocumentTitle('/4dm1n/dev/ui', undefined)).toBe('Catalogue UI — Hubera')
  })

  it('inclut l’email admin si présent', () => {
    expect(buildAdminDocumentTitle('/4dm1n/settings', 'admin@cloudity.local')).toBe(
      'Paramètres — Hubera — admin@cloudity.local'
    )
  })
})
