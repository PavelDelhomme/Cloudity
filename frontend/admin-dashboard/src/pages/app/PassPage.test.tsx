import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PassPage from './PassPage'
import { useAuth } from '../../authContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchVaults: vi.fn(),
  createVault: vi.fn(),
  fetchVaultItems: vi.fn(),
}))

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('PassPage', () => {
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

  it('renders Pass title and breadcrumb', async () => {
    vi.mocked(api.fetchVaults).mockResolvedValue([])
    render(wrap(<PassPage />))
    expect(screen.getByRole('heading', { name: /^Pass$/ })).toBeTruthy()
    expect(screen.getByText(/Coffres et mots de passe/)).toBeTruthy()
  })

  it('shows vault list when fetch succeeds', async () => {
    vi.mocked(api.fetchVaults).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, name: 'Default', created_at: '', updated_at: '' },
    ])
    render(wrap(<PassPage />))
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeTruthy()
    })
  })

  it('on 401 shows error and reconnect button', async () => {
    vi.mocked(api.fetchVaults).mockRejectedValue(new Error('Vaults: 401'))
    const logout = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'u@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout,
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PassPage />))
    await waitFor(() => {
      expect(screen.getByText(/Vaults: 401|401/)).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /Se reconnecter/ })).toBeTruthy()
  })
})
