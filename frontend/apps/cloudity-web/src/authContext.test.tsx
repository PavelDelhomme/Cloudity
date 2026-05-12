import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { TestRouter } from './test-utils'
import { AuthProvider, useAuth } from './authContext'

function Consumer({ onAuth }: { onAuth?: (a: ReturnType<typeof useAuth>) => void } = {}) {
  const auth = useAuth()
  React.useEffect(() => {
    onAuth?.(auth)
  }, [auth, onAuth])
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="email">{auth.email ?? 'null'}</span>
      <span data-testid="tenant">{String(auth.tenantId)}</span>
      <button type="button" onClick={() => auth.logout()}>Logout</button>
    </div>
  )
}

describe('authContext', () => {
  beforeEach(() => {
    localStorage.removeItem('cloudity_admin_auth')
  })

  it('provides isAuthenticated false when no storage', () => {
    render(
      <TestRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </TestRouter>
    )
    expect(screen.getByTestId('authenticated').textContent).toBe('false')
  })

  it('provides login and logout functions', () => {
    render(
      <TestRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </TestRouter>
    )
    expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy()
  })

  it('loads auth from localStorage on mount', () => {
    localStorage.setItem(
      'cloudity_admin_auth',
      JSON.stringify({
        accessToken: 't',
        refreshToken: null,
        tenantId: 2,
        email: 'u@c.com',
      })
    )
    render(
      <TestRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </TestRouter>
    )
    expect(screen.getByTestId('authenticated').textContent).toBe('true')
    expect(screen.getByTestId('email').textContent).toBe('u@c.com')
    expect(screen.getByTestId('tenant').textContent).toBe('2')
  })

  // Garantie anti-régression de la boucle 401 (cf. Global401Handler) :
  // `login()` doit écrire le nouvel access token dans localStorage de manière
  // SYNCHRONE pour que les helpers async qui re-lisent (apiFetch, refreshAccessTokenIfNeeded)
  // voient tout de suite la valeur fraîche, sans attendre le useEffect du provider.
  it('login() persiste l’access token dans localStorage de manière synchrone', () => {
    let captured: ReturnType<typeof useAuth> | null = null
    render(
      <TestRouter>
        <AuthProvider>
          <Consumer onAuth={(a) => { captured = a }} />
        </AuthProvider>
      </TestRouter>
    )
    expect(captured).not.toBeNull()
    act(() => {
      captured!.login('NEW_ACCESS', 'NEW_REFRESH', 7, 'sync@cloudity.local')
    })
    const stored = JSON.parse(localStorage.getItem('cloudity_admin_auth') || '{}')
    expect(stored.accessToken).toBe('NEW_ACCESS')
    expect(stored.refreshToken).toBe('NEW_REFRESH')
    expect(stored.tenantId).toBe(7)
    expect(stored.email).toBe('sync@cloudity.local')
  })
})
