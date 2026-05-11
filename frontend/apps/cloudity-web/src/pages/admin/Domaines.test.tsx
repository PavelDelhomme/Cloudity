import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Domaines from './Domaines'
import { useAuth } from '../../authContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDomainsPage: vi.fn(),
  createDomain: vi.fn(),
  patchDomain: vi.fn(),
  deleteDomain: vi.fn(),
  fetchDomainMailboxesPage: vi.fn(),
  fetchDomainAliasesPage: vi.fn(),
  createDomainMailbox: vi.fn(),
  deleteDomainMailbox: vi.fn(),
  createDomainAlias: vi.fn(),
  deleteDomainAlias: vi.fn(),
  patchDomainMailbox: vi.fn(),
  patchDomainAlias: vi.fn(),
}))

const mockDomains = [
  { id: 1, tenant_id: 1, domain: 'example.com', is_active: true, created_at: '2025-01-01T00:00:00Z', updated_at: '' },
]

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

describe('DomainesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'u@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('renders Domaines mail heading', () => {
    vi.mocked(api.fetchDomainsPage).mockResolvedValue({ items: mockDomains, hasMore: false })
    render(wrap(<Domaines />))
    expect(screen.getByRole('heading', { name: /Domaines mail/ })).toBeTruthy()
  })

  it('shows loading then domain list', async () => {
    vi.mocked(api.fetchDomainsPage).mockResolvedValue({ items: mockDomains, hasMore: false })
    render(wrap(<Domaines />))
    expect(screen.getByText(/Chargement/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeTruthy()
    })
  })

  it('shows unauthenticated when no token', () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: null,
      tenantId: null,
      email: null,
      refreshToken: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<Domaines />))
    expect(screen.getByText(/Non authentifié/)).toBeTruthy()
  })

  it('has domain input and add button', async () => {
    vi.mocked(api.fetchDomainsPage).mockResolvedValue({ items: [], hasMore: false })
    render(wrap(<Domaines />))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/exemple.com/)).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /Ajouter/ })).toBeTruthy()
  })

  it('opens details panel and shows tabs', async () => {
    vi.mocked(api.fetchDomainsPage).mockResolvedValue({ items: mockDomains, hasMore: false })
    vi.mocked(api.fetchDomainMailboxesPage).mockResolvedValue({ items: [], hasMore: false })
    vi.mocked(api.fetchDomainAliasesPage).mockResolvedValue({ items: [], hasMore: false })
    render(wrap(<Domaines />))

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Voir détails/i }))

    await waitFor(() => {
      expect(screen.getByText(/Détails du domaine/)).toBeTruthy()
      expect(screen.getByRole('button', { name: /Boîtes mail/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Aliases/ })).toBeTruthy()
    })
  })
})
