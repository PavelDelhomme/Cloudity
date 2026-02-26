import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Tenants from './Tenants'
import { useAuth } from '../authContext'
import * as api from '../api'

vi.mock('../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api', () => ({ fetchTenants: vi.fn() }))

const mockTenants = [
  {
    id: 1,
    name: 'Acme Corp',
    domain: 'acme.cloudity.io',
    database_url: 'postgresql://localhost/acme',
    is_active: true,
    config: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: null,
  },
]

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

describe('TenantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'admin@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('shows loading then tenants when fetch succeeds', async () => {
    vi.mocked(api.fetchTenants).mockResolvedValue(mockTenants)
    render(wrap(<Tenants />))
    expect(screen.getByText(/Chargement/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeTruthy()
    })
    expect(screen.getByText('acme.cloudity.io')).toBeTruthy()
    expect(screen.getByText('Actif')).toBeTruthy()
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
    render(wrap(<Tenants />))
    expect(screen.getByText(/Non authentifié/)).toBeTruthy()
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(api.fetchTenants).mockRejectedValue(new Error('Network error'))
    render(wrap(<Tenants />))
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy()
    })
  })
})
