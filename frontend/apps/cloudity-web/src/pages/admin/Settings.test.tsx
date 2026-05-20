import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './Settings'

vi.mock('../../authContext', () => ({
  useAuth: vi.fn(),
}))

const useAuth = vi.mocked(await import('../../authContext')).useAuth

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      email: 'admin@cloudity.io',
      tenantId: 42,
      accessToken: 'x',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('renders Settings title', () => {
    renderSettings()
    expect(screen.getByRole('heading', { name: /Paramètres/ })).toBeTruthy()
  })

  it('displays session email and tenant id', () => {
    renderSettings()
    expect(screen.getByText('admin@cloudity.io')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('shows Session section', () => {
    renderSettings()
    expect(screen.getByText('Session')).toBeTruthy()
  })
})
