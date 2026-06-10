import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TasksPage from './TasksPage'
import { useAuth } from '../../../authContext'
import * as api from '../../../api'

vi.mock('../../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../../api', () => ({
  fetchTaskLists: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  createTaskList: vi.fn(),
  updateTask: vi.fn(),
  updateTaskCompleted: vi.fn(),
  deleteTask: vi.fn(),
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
    queryClient.clear()
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchTaskLists).mockResolvedValue([])
    vi.mocked(api.fetchTasks).mockResolvedValue([])
  })

  it('renders Tâches title and breadcrumb', () => {
    render(wrap(<TasksPage />))
    expect(screen.getByRole('heading', { name: 'Tâches' })).toBeTruthy()
    expect(screen.getByText(/productivité/)).toBeTruthy()
  })

  it('affiche le bouton Paramètres Tâches', () => {
    render(wrap(<TasksPage />))
    expect(screen.getByRole('button', { name: 'Paramètres Tâches' })).toBeTruthy()
  })

  it('shows empty state when no tasks', async () => {
    render(wrap(<TasksPage />))
    await screen.findByText(/Aucune tâche/)
    expect(screen.getByText(/Ajoutez une tâche/)).toBeTruthy()
  })

  it('paramètres : masque la section des tâches terminées', async () => {
    vi.mocked(api.fetchTasks).mockResolvedValue([
      {
        id: 1,
        tenant_id: 1,
        user_id: 1,
        title: 'Tâche ouverte',
        completed: false,
        due_at: null,
        repeat_rule: null,
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 2,
        tenant_id: 1,
        user_id: 1,
        title: 'Tâche terminée',
        completed: true,
        due_at: null,
        repeat_rule: null,
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-02T10:00:00.000Z',
      },
    ])
    render(wrap(<TasksPage />))

    await screen.findByDisplayValue('Tâche terminée')
    expect(screen.getByText('Terminées')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres Tâches' }))
    fireEvent.click(screen.getByLabelText('Afficher les tâches terminées'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(screen.queryByText('Terminées')).toBeNull()
    })
    expect(screen.queryByDisplayValue('Tâche terminée')).toBeNull()
  })
})
