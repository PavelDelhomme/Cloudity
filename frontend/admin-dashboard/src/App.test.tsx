import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './App'

const queryClient = new QueryClient()

function TestWrapper({ children, initialEntries = ['/'] }: { children: React.ReactNode; initialEntries?: string[] }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('App', () => {
  beforeEach(() => {
    localStorage.removeItem('cloudity_admin_auth')
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

  it('after logout redirects to login and clears session', () => {
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
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
    expect(localStorage.getItem('cloudity_admin_auth')).toBeNull()
  })

  it('renders app hub when authenticated at /app', () => {
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
    expect(screen.getByText('Choisissez une application pour continuer.')).toBeTruthy()
  })

  it('renders Calendar page when authenticated at /app/calendar', () => {
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
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy()
    expect(screen.getByText('Événements et rendez-vous.')).toBeTruthy()
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
