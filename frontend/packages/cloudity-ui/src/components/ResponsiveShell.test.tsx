import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResponsiveShell } from './ResponsiveShell'

describe('ResponsiveShell', () => {
  it('affiche la navigation et le contenu principal', () => {
    render(
      <MemoryRouter initialEntries={['/4dm1n/dev/ui']}>
        <ResponsiveShell
          brandTitle="Cloudity"
          brandSubtitle="Administration"
          navItems={[{ key: 'ui', label: 'Catalogue UI', href: '/4dm1n/dev/ui', end: true }]}
        >
          <p>Contenu admin</p>
        </ResponsiveShell>
      </MemoryRouter>
    )
    expect(screen.getByText('Catalogue UI')).toBeTruthy()
    expect(screen.getByText('Contenu admin')).toBeTruthy()
  })
})
