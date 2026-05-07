import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from './test-utils'
import { AuthProvider, useAuth } from './authContext'

function Consumer() {
  const auth = useAuth()
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
})
