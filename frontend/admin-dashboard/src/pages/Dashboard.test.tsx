import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './Dashboard'
import { useAuth } from '../authContext'
import * as api from '../api'

vi.mock('../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api', () => ({ fetchDashboardStats: vi.fn() }))

const mockStats = { active_tenants: 5, total_users: 10, api_calls_today: 3421 }

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

describe('Dashboard', () => {
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

  it('renders Dashboard heading', () => {
    vi.mocked(api.fetchDashboardStats).mockResolvedValue(mockStats)
    render(wrap(<Dashboard />))
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows loading then stats when fetch succeeds', async () => {
    vi.mocked(api.fetchDashboardStats).mockResolvedValue(mockStats)
    render(wrap(<Dashboard />))
    expect(screen.getByText(/Chargement des statistiques/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTestId('stat-active-tenants').textContent).toBe('5')
    })
    expect(screen.getByTestId('stat-total-users').textContent).toBe('10')
    expect(screen.getByTestId('stat-api-calls').textContent).toBe('3,421')
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
    render(wrap(<Dashboard />))
    expect(screen.getByText(/Non authentifié/)).toBeTruthy()
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(api.fetchDashboardStats).mockRejectedValue(new Error('Stats: 503'))
    render(wrap(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText(/Stats: 503/)).toBeTruthy()
    })
  })
})
