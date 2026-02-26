import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Vaults from './Vaults'
import { useAuth } from '../authContext'
import * as api from '../api'

vi.mock('../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api', () => ({
  fetchVaults: vi.fn(),
  createVault: vi.fn(),
  fetchVaultItems: vi.fn(),
}))

const mockVaults = [
  { id: 1, user_id: 1, tenant_id: 1, name: 'Default', created_at: '2025-01-01T00:00:00Z', updated_at: '' },
]

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

describe('VaultsPage', () => {
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

  it('renders Vaults heading', () => {
    vi.mocked(api.fetchVaults).mockResolvedValue(mockVaults)
    render(wrap(<Vaults />))
    expect(screen.getByRole('heading', { name: /Coffres \(Pass\)/ })).toBeTruthy()
  })

  it('shows loading then vault list', async () => {
    vi.mocked(api.fetchVaults).mockResolvedValue(mockVaults)
    render(wrap(<Vaults />))
    expect(screen.getByText(/Chargement/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeTruthy()
    })
    expect(screen.getByTestId('vault-1')).toBeTruthy()
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
    render(wrap(<Vaults />))
    expect(screen.getByText(/Non authentifié/)).toBeTruthy()
  })

  it('has create vault input and button', async () => {
    vi.mocked(api.fetchVaults).mockResolvedValue([])
    render(wrap(<Vaults />))
    await waitFor(() => {
      expect(screen.getByTestId('new-vault-name')).toBeTruthy()
    })
    expect(screen.getByTestId('create-vault-btn')).toBeTruthy()
  })
})
