import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TasksPage from './TasksPage'

describe('TasksPage', () => {
  it('renders Tasks title and breadcrumb', () => {
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows coming soon message', () => {
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Tâches à venir/)).toBeTruthy()
    expect(screen.getByText(/Le service Tasks sera intégré/)).toBeTruthy()
  })
})
