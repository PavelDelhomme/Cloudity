import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppHub from './AppHub'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))

const queryClient = new QueryClient()

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
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

  it('renders all 9 app cards: Drive, Office, Pass, Mail, Calendar, Notes, Tasks, Contacts, Photos', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Office' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pass' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Mail' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Photos' })).toBeTruthy()
  })

  it('links each app to correct route', () => {
    render(wrap(<AppHub />))
    const driveLink = screen.getByRole('link', { name: (content, el) => el.getAttribute('href') === '/app/drive' })
    const officeLink = screen.getByRole('link', { name: (content, el) => el.getAttribute('href') === '/app/office' })
    expect(driveLink.getAttribute('href')).toBe('/app/drive')
    expect(officeLink.getAttribute('href')).toBe('/app/office')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/pass' }).getAttribute('href')).toBe('/app/pass')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/mail' }).getAttribute('href')).toBe('/app/mail')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/calendar' }).getAttribute('href')).toBe('/app/calendar')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/notes' }).getAttribute('href')).toBe('/app/notes')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/tasks' }).getAttribute('href')).toBe('/app/tasks')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/contacts' }).getAttribute('href')).toBe('/app/contacts')
    expect(screen.getByRole('link', { name: (_, el) => el.getAttribute('href') === '/app/photos' }).getAttribute('href')).toBe('/app/photos')
  })

  it('shows coming soon for Office, Contacts, Photos', () => {
    render(wrap(<AppHub />))
    expect(screen.getByText(/Documents, tableurs et présentations/)).toBeTruthy()
    expect(screen.getByText(/Carnet d.adresses.*à venir/i)).toBeTruthy()
    expect(screen.getByText(/Galerie et stockage photos.*à venir/)).toBeTruthy()
  })
})
