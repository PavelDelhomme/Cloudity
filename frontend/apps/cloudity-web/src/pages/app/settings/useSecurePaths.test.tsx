/**
 * Tests Vitest pour `useSecurePaths` + `SettingsRedirect` + `SecureSettingsPage`.
 *
 * Stratégie : on stub les modules `../../../api` et `../../../authContext`
 * pour piloter les états (token JWT présent / chemin rotatif disponible /
 * 503 / 403 / OK). On vérifie :
 *
 *  1. `useSecurePaths` retourne le chemin rotatif quand le serveur l'émet.
 *  2. Repli silencieux sur le chemin canonique en cas de 503.
 *  3. `SettingsRedirect` redirige vers `/app/settings/sec/<token>` quand
 *     le slug est disponible, sinon vers `/app/settings/canonical`.
 *  4. `SecureSettingsPage` redirige vers `/app/settings/canonical` si la
 *     validation renvoie `false` (pas `/app/settings` — boucle 403/429).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../../authContext', () => ({
  useAuth: () => ({
    accessToken: 'fake-jwt',
    refreshToken: null,
    tenantId: 1,
    email: 'u@example.com',
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    setTokens: vi.fn(),
  }),
}))

const fetchSecurePaths = vi.fn()
const validateSecurePath = vi.fn()
vi.mock('../../../api', () => ({
  fetchSecurePaths: (...a: unknown[]) => fetchSecurePaths(...a),
  validateSecurePath: (...a: unknown[]) => validateSecurePath(...a),
}))

// Stub AppSettingsPage pour éviter de monter toute la cascade (passkeys, …).
vi.mock('./AppSettingsPage', () => ({
  default: () => <div data-testid="settings-page">SETTINGS_OK</div>,
}))

import SettingsRedirect from './SettingsRedirect'
import SecureSettingsPage from './SecureSettingsPage'
import { useSecurePaths } from './useSecurePaths'

function renderWithRouter(initial: string, ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/settings" element={ui} />
          <Route path="/app/settings/canonical" element={<div data-testid="canonical">CANONICAL</div>} />
          <Route path="/app/settings/sec/:token" element={<SecureSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchSecurePaths.mockReset()
  validateSecurePath.mockReset()
})

describe('SettingsRedirect', () => {
  it('redirige vers le chemin rotatif quand le serveur le fournit', async () => {
    fetchSecurePaths.mockResolvedValue({
      paths: {
        settings_security: {
          path: '/app/settings/sec/123.deadbeef',
          token: '123.deadbeef',
          expires_at: '2099-01-01T00:00:00Z',
          rotates_at: '2099-01-01T00:00:00Z',
        },
      },
      issued_at: '2026-05-13T00:00:00Z',
      window_seconds: 2592000,
    })
    validateSecurePath.mockResolvedValue(true)

    renderWithRouter('/app/settings', <SettingsRedirect />)

    await waitFor(() => expect(screen.getByTestId('settings-page')).toBeTruthy())
  })

  it('redirige vers /app/settings/canonical quand le serveur renvoie 503', async () => {
    fetchSecurePaths.mockRejectedValue(new Error('HTTP 503: secret indisponible'))

    renderWithRouter('/app/settings', <SettingsRedirect />)

    await waitFor(() => expect(screen.getByTestId('canonical')).toBeTruthy())
  })
})

describe('SecureSettingsPage', () => {
  it('rend AppSettingsPage si la validation est OK', async () => {
    validateSecurePath.mockResolvedValue(true)

    renderWithRouter('/app/settings/sec/abcdef', <SecureSettingsPage />)

    await waitFor(() => expect(screen.getByTestId('settings-page')).toBeTruthy())
  })

  it('redirige vers /app/settings/canonical si validation 403', async () => {
    validateSecurePath.mockResolvedValue(false)

    renderWithRouter('/app/settings/sec/expired', <SecureSettingsPage />)

    await waitFor(() => expect(screen.getByTestId('canonical')).toBeTruthy())
  })

  it('affiche une erreur sans boucler si validate échoue (429/réseau)', async () => {
    validateSecurePath.mockRejectedValue(new Error('HTTP 429: Too Many Requests'))

    renderWithRouter('/app/settings/sec/flooded', <SecureSettingsPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/Too Many Requests/i)).toBeTruthy()
    expect(screen.queryByTestId('canonical')).toBeNull()
  })
})

describe('useSecurePaths', () => {
  it('expose isRotated=true quand le slug est dispo', async () => {
    fetchSecurePaths.mockResolvedValue({
      paths: {
        settings_security: {
          path: '/app/settings/sec/xyz',
          token: 'xyz',
          expires_at: '2099-01-01T00:00:00Z',
          rotates_at: '2099-01-01T00:00:00Z',
        },
      },
      issued_at: '2026-05-13T00:00:00Z',
      window_seconds: 2592000,
    })

    function Probe() {
      const r = useSecurePaths()
      return (
        <>
          <span data-testid="rotated">{String(r.isRotated)}</span>
          <span data-testid="path">{r.settingsSecurity}</span>
        </>
      )
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('rotated').textContent).toBe('true'))
    expect(screen.getByTestId('path').textContent).toBe('/app/settings/sec/xyz')
  })
})
