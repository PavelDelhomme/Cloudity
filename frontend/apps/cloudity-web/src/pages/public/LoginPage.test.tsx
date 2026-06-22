import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import LoginPage from './LoginPage'
import { useAuth } from '../../authContext'
import * as api from '../../api'
import * as webauthn from '../../webauthn'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({ login: vi.fn(), verify2FA: vi.fn() }))
vi.mock('../../webauthn', () => ({
  isWebAuthnSupported: vi.fn(() => false),
  loginWithPasskey: vi.fn(),
  loginWithPasskeyDiscoverable: vi.fn(() => new Promise(() => {})),
}))

describe('LoginPage', () => {
  const mockLogin = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      login: mockLogin,
      accessToken: null,
      tenantId: null,
      email: null,
      refreshToken: null,
      isAuthenticated: false,
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('renders first login step with email only (no tenant ID)', () => {
    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )
    expect(screen.getByRole('link', { name: 'Cloudity' })).toBeTruthy()
    expect(screen.getByText('Connexion')).toBeTruthy()
    expect(screen.getByLabelText(/Email/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Mot de passe/i)).toBeNull()
    expect(screen.queryByLabelText(/Tenant ID/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy()
  })

  it('moves to password step after email', () => {
    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )
    const email = screen.getByLabelText(/Email/i)
    expect(email.getAttribute('type')).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('username webauthn')

    fireEvent.change(email, { target: { value: 'admin@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(screen.getByText('admin@test.com')).toBeTruthy()
    const password = screen.getByLabelText(/Mot de passe/i)
    expect(password.getAttribute('type')).toBe('password')
    expect(password.getAttribute('autocomplete')).toBe('current-password')
  })

  it('calls login API and setAuth on success (tenant_id default 1)', async () => {
    vi.mocked(api.login).mockResolvedValue({
      access_token: 'token',
      refresh_token: 'rt',
    })
    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    fireEvent.change(screen.getByLabelText(/Mot de passe/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'admin@test.com',
        password: 'secret',
      })
    })
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('token', 'rt', 1, 'admin@test.com')
    })
  })

  it('uses discoverable passkey without requiring email', async () => {
    vi.mocked(webauthn.isWebAuthnSupported).mockReturnValue(true)
    vi.mocked(webauthn.loginWithPasskeyDiscoverable)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        access_token: 'passkey-token',
        refresh_token: 'passkey-refresh',
        role: 'admin',
        user_id: '1',
        email: 'passkey@test.com',
      })

    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser une passkey' }))

    await waitFor(() => {
      expect(webauthn.loginWithPasskeyDiscoverable).toHaveBeenLastCalledWith('1', undefined, false)
    })
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('passkey-token', 'passkey-refresh', 1, 'passkey@test.com')
    })
    expect(api.login).not.toHaveBeenCalled()
  })
})
