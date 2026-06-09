import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { routerFuture } from './test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserAppRoutes } from './App'
import { AdminAppRoutes } from './AdminApp'
import { AuthProvider } from './authContext'

/** JWT factice avec rôle admin (même forme que les tests gateway / AdminAccessGate). */
function adminAccessJwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const mid = btoa(JSON.stringify({ role: 'admin', user_id: 1, tenant_id: 1, exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `x.${mid}.y`
}

describe('App', () => {
  let queryClient: QueryClient

  function TestWrapper({ children, initialEntries = ['/'] }: { children: React.ReactNode; initialEntries?: string[] }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries} future={routerFuture}>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    localStorage.removeItem('cloudity_admin_auth')
    localStorage.removeItem('cloudity_sidebar_visible')
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('smoke test', () => {
    expect(true).toBe(true)
  })

  it('renders login when unauthenticated', () => {
    render(
      <TestWrapper initialEntries={['/login']}>
        <UserAppRoutes />
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
      email: 'user@test.com',
    }
    localStorage.setItem('cloudity_admin_auth', JSON.stringify(auth))
    localStorage.setItem('cloudity_sidebar_visible', 'true')
    render(
      <TestWrapper initialEntries={['/app/drive']}>
        <UserAppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    const logoutBtn = screen.getByRole('button', { name: /déconnexion/i })
    fireEvent.click(logoutBtn)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
    })
    expect(localStorage.getItem('cloudity_admin_auth')).toBeNull()
  })

  it('renders admin dashboard when JWT has admin role at /4dm1n', () => {
    localStorage.setItem(
      'cloudity_admin_auth',
      JSON.stringify({
        accessToken: adminAccessJwt(),
        refreshToken: null,
        tenantId: 1,
        email: 'admin@test.com',
      })
    )
    render(
      <TestWrapper initialEntries={['/4dm1n']}>
        <AdminAppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
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
        <UserAppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Fichiers')).toBeTruthy(), { timeout: 15_000 })
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
        <UserAppRoutes />
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
        <UserAppRoutes />
      </TestWrapper>
    )
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: /Calendrier/ })).toBeTruthy()
      },
      { timeout: 15_000 }
    )
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
        <UserAppRoutes />
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
        <UserAppRoutes />
      </TestWrapper>
    )
    expect(screen.getByRole('heading', { name: 'Tâches' })).toBeTruthy()
    expect(screen.getByText(/productivité/)).toBeTruthy()
  })
})
