import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TestRouter } from '../test-utils'
import LoginPage from './public/LoginPage'
import { useAuth } from '../authContext'
import * as api from '../api'

vi.mock('../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api', () => ({ login: vi.fn() }))

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

  it('renders login form with title and fields (no tenant ID)', () => {
    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )
    expect(screen.getByRole('link', { name: 'Cloudity' })).toBeTruthy()
    expect(screen.getByText('Connexion')).toBeTruthy()
    expect(screen.getByLabelText(/Email/i)).toBeTruthy()
    expect(screen.getByLabelText(/Mot de passe/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Tenant ID/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
  })

  it('has email and password inputs', () => {
    render(
      <TestRouter>
        <LoginPage />
      </TestRouter>
    )
    const email = screen.getByLabelText(/Email/i)
    const password = screen.getByLabelText(/Mot de passe/i)
    expect(email.getAttribute('type')).toBe('email')
    expect(password.getAttribute('type')).toBe('password')
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
})
