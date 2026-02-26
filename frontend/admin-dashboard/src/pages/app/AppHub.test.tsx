import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppHub from './AppHub'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))

const queryClient = new QueryClient()

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppHub', () => {
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

  it('renders hub title and subtitle', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
    expect(screen.getByText('Choisissez une application pour continuer.')).toBeTruthy()
  })

  it('renders all 6 app cards: Drive, Pass, Mail, Calendar, Notes, Tasks', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pass' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Mail' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
  })

  it('links each app to correct route', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: /Drive/ }).getAttribute('href')).toBe('/app/drive')
    expect(screen.getByRole('link', { name: /Pass/ }).getAttribute('href')).toBe('/app/pass')
    expect(screen.getByRole('link', { name: /Mail/ }).getAttribute('href')).toBe('/app/mail')
    expect(screen.getByRole('link', { name: /Calendar/ }).getAttribute('href')).toBe('/app/calendar')
    expect(screen.getByRole('link', { name: /Notes/ }).getAttribute('href')).toBe('/app/notes')
    expect(screen.getByRole('link', { name: /Tasks/ }).getAttribute('href')).toBe('/app/tasks')
  })

  it('shows coming soon for Calendar, Notes, Tasks', () => {
    render(wrap(<AppHub />))
    expect(screen.getByText('Agenda et événements (à venir).')).toBeTruthy()
    expect(screen.getByText('Notes et bloc-notes (à venir).')).toBeTruthy()
    expect(screen.getByText('Tâches et to-do (à venir).')).toBeTruthy()
  })
})
