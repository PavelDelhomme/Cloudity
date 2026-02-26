import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotesPage from './NotesPage'

describe('NotesPage', () => {
  it('renders Notes title and breadcrumb', () => {
    render(
      <MemoryRouter>
        <NotesPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows coming soon message', () => {
    render(
      <MemoryRouter>
        <NotesPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Notes à venir/)).toBeTruthy()
    expect(screen.getByText(/Le service Notes sera intégré/)).toBeTruthy()
  })
})
