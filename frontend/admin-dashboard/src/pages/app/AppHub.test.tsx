import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppHub from './AppHub'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDriveRecentFiles: vi.fn().mockResolvedValue([]),
  fetchDriveTrash: vi.fn().mockResolvedValue([]),
  fetchMailAccounts: vi.fn().mockResolvedValue([]),
  fetchMailMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }),
  fetchCalendarEvents: vi.fn().mockResolvedValue([]),
  fetchNotes: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchContacts: vi.fn().mockResolvedValue([]),
}))

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
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
    expect(screen.getByText(/aperçus des derniers contenus/i)).toBeTruthy()
  })

  it('renders category sections', () => {
    render(wrap(<AppHub />))
    expect(screen.getByText('Fichiers')).toBeTruthy()
    expect(screen.getByText('Communication')).toBeTruthy()
  })

  it('renders all 10 main app links with aria-label', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: 'Ouvrir Drive' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Office' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Pass' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Mail' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Corbeille' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Calendar' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Notes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Tasks' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Contacts' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ouvrir Photos' })).toBeTruthy()
  })

  it('links each main app to correct route', () => {
    render(wrap(<AppHub />))
    expect(screen.getByRole('link', { name: 'Ouvrir Drive' }).getAttribute('href')).toBe('/app/drive')
    expect(screen.getByRole('link', { name: 'Ouvrir Office' }).getAttribute('href')).toBe('/app/office')
    expect(screen.getByRole('link', { name: 'Ouvrir Pass' }).getAttribute('href')).toBe('/app/pass')
    expect(screen.getByRole('link', { name: 'Ouvrir Mail' }).getAttribute('href')).toBe('/app/mail')
    expect(screen.getByRole('link', { name: 'Ouvrir Corbeille' }).getAttribute('href')).toBe('/app/corbeille')
    expect(screen.getByRole('link', { name: 'Ouvrir Calendar' }).getAttribute('href')).toBe('/app/calendar')
    expect(screen.getByRole('link', { name: 'Ouvrir Notes' }).getAttribute('href')).toBe('/app/notes')
    expect(screen.getByRole('link', { name: 'Ouvrir Tasks' }).getAttribute('href')).toBe('/app/tasks')
    expect(screen.getByRole('link', { name: 'Ouvrir Contacts' }).getAttribute('href')).toBe('/app/contacts')
    expect(screen.getByRole('link', { name: 'Ouvrir Photos' }).getAttribute('href')).toBe('/app/photos')
  })
})
