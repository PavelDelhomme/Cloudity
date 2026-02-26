import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CalendarPage from './CalendarPage'

describe('CalendarPage', () => {
  it('renders Calendar title and breadcrumb', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows coming soon message', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Agenda à venir/)).toBeTruthy()
    expect(screen.getByText(/Le service Calendar sera intégré/)).toBeTruthy()
  })
})
