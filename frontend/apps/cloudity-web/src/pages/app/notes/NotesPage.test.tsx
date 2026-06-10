import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotesPage from './NotesPage'
import { useAuth } from '../../../authContext'
import * as api from '../../../api'

vi.mock('../../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../../api', () => ({
  fetchNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('NotesPage', () => {
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
    vi.mocked(api.fetchNotes).mockResolvedValue([])
  })

  it('renders Notes title and breadcrumb', () => {
    render(wrap(<NotesPage />))
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByText(/Bloc-notes et idées/)).toBeTruthy()
  })

  it('affiche le bouton Paramètres Notes', () => {
    render(wrap(<NotesPage />))
    expect(screen.getByRole('button', { name: 'Paramètres Notes' })).toBeTruthy()
  })

  it('shows empty state when no notes', async () => {
    render(wrap(<NotesPage />))
    await screen.findByText(/Aucune note/)
    expect(screen.getByText(/Créez une note/)).toBeTruthy()
  })

  it('paramètres : masque l’aperçu du contenu après enregistrement', async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      {
        id: 1,
        tenant_id: 1,
        user_id: 1,
        title: 'Note test',
        content: 'Contenu sensible à masquer',
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T10:00:00.000Z',
      },
    ])
    render(wrap(<NotesPage />))

    await screen.findByText('Contenu sensible à masquer')
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres Notes' }))
    fireEvent.click(screen.getByLabelText('Aperçu du contenu'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(screen.queryByText('Contenu sensible à masquer')).toBeNull()
    })
  })
})
