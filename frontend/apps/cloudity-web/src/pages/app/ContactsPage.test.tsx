import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContactsPage from './ContactsPage'
import { useAuth } from '../../authContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('ContactsPage', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchContacts).mockResolvedValue([])
  })

  it('renders Contacts title and description', async () => {
    render(wrap(<ContactsPage />))
    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeTruthy()
    expect(screen.getByText(/Google Contacts/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ouvrir Mail/ })).toBeTruthy()
  })

  it('shows Nouveau contact button', () => {
    render(wrap(<ContactsPage />))
    expect(screen.getByRole('button', { name: 'Nouveau contact' })).toBeTruthy()
  })

  it('shows empty state when no contacts', async () => {
    render(wrap(<ContactsPage />))
    await screen.findByText(/Aucun contact/)
    expect(screen.getByText(/Ajoutez-en un pour les retrouver comme destinataires dans Mail/)).toBeTruthy()
  })

  it('shows contact list when contacts exist', async () => {
    vi.mocked(api.fetchContacts).mockResolvedValue([
      { id: 1, name: 'Jean Dupont', email: 'jean@exemple.fr', phone: '+33 6 12 34 56 78' },
      { id: 2, name: '', email: 'marie@test.fr', phone: '' },
    ])
    render(wrap(<ContactsPage />))
    await screen.findByText('Jean Dupont')
    expect(screen.getByText('jean@exemple.fr')).toBeTruthy()
    expect(screen.getByText('marie@test.fr')).toBeTruthy()
  })
})
