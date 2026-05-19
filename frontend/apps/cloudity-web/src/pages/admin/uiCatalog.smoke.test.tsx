import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UiCatalogPage from './UiCatalogPage'

describe('UiCatalogPage', () => {
  it('affiche le titre et les variantes de boutons', () => {
    render(
      <MemoryRouter>
        <UiCatalogPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Catalogue UI' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Primary' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Danger' })).toBeTruthy()
  })
})
