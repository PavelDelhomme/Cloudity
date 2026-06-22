import { describe, expect, it } from 'vitest'
import { buildAdminDocumentTitle } from './AdminLayout'

describe('buildAdminDocumentTitle', () => {
  it('tableau de bord admin : Administration — Cloudity', () => {
    expect(buildAdminDocumentTitle('/4dm1n', undefined)).toBe('Administration — Cloudity')
    expect(buildAdminDocumentTitle('/4dm1n/', undefined)).toBe('Administration — Cloudity')
  })

  it('sous-pages : section — Cloudity', () => {
    expect(buildAdminDocumentTitle('/4dm1n/tenants', undefined)).toBe('Tenants — Cloudity')
    expect(buildAdminDocumentTitle('/4dm1n/users', undefined)).toBe('Utilisateurs — Cloudity')
    expect(buildAdminDocumentTitle('/4dm1n/dev/ui', undefined)).toBe('Catalogue UI — Cloudity')
  })

  it('inclut l’email admin si présent', () => {
    expect(buildAdminDocumentTitle('/4dm1n/settings', 'admin@cloudity.local')).toBe(
      'Paramètres — Cloudity — admin@cloudity.local'
    )
  })
})
