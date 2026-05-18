import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TestRouter } from '../../../test-utils'
import PassPage from './PassPage'
import { useAuth } from '../../../authContext'

vi.mock('../../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../../api', () => ({
  fetchVaults: vi.fn().mockResolvedValue([{ id: 1, name: 'Principal' }]),
  fetchMailAccounts: vi.fn().mockResolvedValue([]),
  createVault: vi.fn(),
  fetchVaultItems: vi.fn(),
  createVaultItem: vi.fn(),
  updateVaultItem: vi.fn(),
  deleteVaultItem: vi.fn(),
}))

/**
 * Construit un JWT factice (signature random) — la signature n'est pas vérifiée
 * côté front, on extrait juste `user_id` du payload.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (obj: object): string =>
    btoa(JSON.stringify(obj)).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'none' })}.${enc(payload)}.signature`
}

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <TestRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </TestRouter>
  )
}

describe('PassPage (verrouillé par défaut)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un message de session quand le JWT ne porte pas user_id', () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'pas-un-jwt',
      tenantId: 1,
      email: 'u@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PassPage />))
    expect(screen.getByText(/Session ou identifiant utilisateur indisponible/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Aller à la connexion/i })).toBeTruthy()
  })

  it('affiche le titre Pass + écran de déverrouillage avec un JWT valide', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: fakeJwt({ user_id: 42, sub: 'user-42' }),
      tenantId: 1,
      email: 'u@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PassPage />))
    expect(screen.getByRole('heading', { name: /^Pass$/ })).toBeTruthy()
    expect(await screen.findByText(/Coffre verrouillé/)).toBeTruthy()
    expect(screen.getByLabelText(/Mot de passe maître/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Déverrouiller/ })).toBeTruthy()
  })

  it('mention l\'auto-verrouillage et le chiffrement client-side', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: fakeJwt({ user_id: 42 }),
      tenantId: 1,
      email: 'u@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PassPage />))
    await waitFor(() => {
      expect(screen.getByText(/Auto-verrouillage après 5 minutes/)).toBeTruthy()
    })
    expect(screen.getByText(/Argon2id/)).toBeTruthy()
  })
})
