import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { routerFuture } from './test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './App'

describe('App', () => {
  let queryClient: QueryClient

  function TestWrapper({ children, initialEntries = ['/'] }: { children: React.ReactNode; initialEntries?: string[] }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries} future={routerFuture}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    localStorage.removeItem('cloudity_admin_auth')
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('smoke test', () => {
    expect(true).toBe(true)
  })

  it('renders login when unauthenticated', () => {
    render(
      <TestWrapper initialEntries={['/login']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('link', { name: 'Cloudity' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
  })

  it('after logout redirects to login and clears session', async () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'admin@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/admin']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
    const logoutBtn = screen.getByRole('button', { name: /déconnexion/i })
    fireEvent.click(logoutBtn)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
    })
    expect(localStorage.getItem('cloudity_admin_auth')).toBeNull()
  })

  it('renders app hub when authenticated at /app', async () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/app']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
    await waitFor(() => {
      expect(
        screen.getByText(/Choisissez une application par catégorie — aperçus des derniers contenus lorsque c’est possible/)
      ).toBeTruthy()
    })
  })

  it('renders Drive page when authenticated at /app/drive', () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/app/drive']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByText('Téléverser')).toBeTruthy()
  })

  it('renders Calendar page when authenticated at /app/calendar', async () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/app/calendar']}>
        <AppRoutes />
      </TestWrapper>
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Calendrier' })).toBeTruthy()
    })
    expect(screen.getByText(/Vue mois type Google Agenda/)).toBeTruthy()
  })

  it('renders Notes page when authenticated at /app/notes', () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/app/notes']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByText('Bloc-notes et idées.')).toBeTruthy()
  })

  it('renders Tasks page when authenticated at /app/tasks', () => {
    const auth = {
      accessToken: 'token',
      refreshToken: null,
      tenantId: 1,
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    render(
      <TestWrapper initialEntries={['/app/tasks']}>
        <AppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tâches' })).toBeTruthy()
    expect(screen.getByText('To-do et listes.')).toBeTruthy()
  })
})
