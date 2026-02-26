import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UsersPage from './Users'

import { useAuth } from '../authContext'
import * as api from '../api'

vi.mock('../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api', () => ({ fetchUsers: vi.fn() }))

const mockUsers = [
  {
    id: 1,
    tenant_id: 1,
    email: 'u1@example.com',
    is_2fa_enabled: false,
    is_active: true,
    role: 'user',
    last_login: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: null,
  },
]

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'admin@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('shows loading then users when fetch succeeds', async () => {
    vi.mocked(api.fetchUsers).mockResolvedValue(mockUsers)
    render(wrap(<UsersPage />))
    expect(screen.getByText(/Chargement/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('u1@example.com')).toBeTruthy()
    })
    expect(screen.getByText('user')).toBeTruthy()
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
    render(wrap(<UsersPage />))
    expect(screen.getByText(/Non authentifié/)).toBeTruthy()
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(api.fetchUsers).mockRejectedValue(new Error('Network error'))
    render(wrap(<UsersPage />))
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy()
    })
  })
})
