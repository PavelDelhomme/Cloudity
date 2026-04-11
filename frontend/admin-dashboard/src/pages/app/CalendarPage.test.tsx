import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPage from './CalendarPage'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchCalendarEvents: vi.fn().mockResolvedValue([]),
  createCalendarEvent: vi.fn(),
  fetchUserCalendars: vi.fn().mockResolvedValue([]),
  createUserCalendar: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}))

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

  it('affiche le titre Calendrier et la vue mois (jours lun.–dim.)', async () => {
    render(wrap(<CalendarPage />))
    expect(screen.getByRole('heading', { name: 'Calendrier' })).toBeTruthy()
    expect(screen.getByText(/Vue mois type Google Agenda/)).toBeTruthy()
    expect(screen.getByText('lun.')).toBeTruthy()
    expect(screen.getByText('dim.')).toBeTruthy()
  })

  it('en vue Agenda affiche le message vide lorsqu’il n’y a pas d’événements', async () => {
    render(wrap(<CalendarPage />))
    fireEvent.click(screen.getByRole('button', { name: 'Vue agenda (liste)' }))
    await waitFor(() => {
      expect(screen.getByText(/Aucun événement sur la période filtrée/)).toBeTruthy()
    })
  })

  it('affiche les libellés Mes agendas et Tous les agendas', async () => {
    render(wrap(<CalendarPage />))
    expect(screen.getByText('Mes agendas')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tous les agendas/i })).toBeTruthy()
  })
})
