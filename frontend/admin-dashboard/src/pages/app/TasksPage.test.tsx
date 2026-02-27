import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TasksPage from './TasksPage'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchTaskLists: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTaskCompleted: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('TasksPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('renders Tâches title and breadcrumb', () => {
    render(wrap(<TasksPage />))
    expect(screen.getByRole('heading', { name: 'Tâches' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows empty state when no tasks', async () => {
    render(wrap(<TasksPage />))
    await screen.findByText(/Aucune tâche/)
    expect(screen.getByText(/Ajoutez une tâche/)).toBeTruthy()
  })
})
