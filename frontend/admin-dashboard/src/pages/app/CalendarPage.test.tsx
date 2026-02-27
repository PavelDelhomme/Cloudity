import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPage from './CalendarPage'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchCalendarEvents: vi.fn().mockResolvedValue([]),
  createCalendarEvent: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('CalendarPage', () => {
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

  it('renders Agenda title and breadcrumb', async () => {
    render(wrap(<CalendarPage />))
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('shows empty state when no events', async () => {
    render(wrap(<CalendarPage />))
    await screen.findByText(/Aucun événement/)
    expect(screen.getByText(/Ajoutez un événement/)).toBeTruthy()
  })
})
