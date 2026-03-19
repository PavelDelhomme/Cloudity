/**
 * Tests de performance : rendu des pages et interactions.
 * Objectif : détecter les régressions (rendu trop lent, trop de re-renders).
 * Seuil de temps adapté à la CI (jsdom est plus rapide qu'un vrai navigateur).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TestRouter } from './test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DrivePage from './pages/app/DrivePage'
import AppHub from './pages/app/AppHub'
import { useAuth } from './authContext'
import { UploadProvider } from './UploadProvider'

const PERF = {
  /** Temps max acceptable pour le premier rendu d'une page avec liste (ms). CI/jsdom peut être lent. */
  PAGE_RENDER_MS: 2000,
  /** Temps max pour le rendu du hub (peu d'éléments). Assoupli pour CI / machines lentes. */
  HUB_RENDER_MS: 5000,
  /** Temps max pour une interaction (clic) jusqu'à mise à jour. */
  INTERACTION_MS: 1500,
}

vi.mock('./authContext', () => ({ useAuth: vi.fn() }))
vi.mock('./api', () => ({
  fetchDriveNodes: vi.fn(),
  createDriveFolder: vi.fn(),
  createDriveFile: vi.fn(),
  createDriveFileWithUniqueName: vi.fn(),
  renameDriveNode: vi.fn(),
  deleteDriveNode: vi.fn(),
  downloadDriveFile: vi.fn(),
  uploadDriveFile: vi.fn(),
  uploadDriveFileWithProgress: vi.fn().mockResolvedValue({ id: 1, name: 'f', size: 0 }),
  moveDriveNode: vi.fn(),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function wrap(ui: React.ReactElement, client?: QueryClient) {
  const q = client ?? queryClient
  return (
    <QueryClientProvider client={q}>
      <UploadProvider>
        <TestRouter>{ui}</TestRouter>
      </UploadProvider>
    </QueryClientProvider>
  )
}

describe('Performance', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('DrivePage avec ~80 nœuds se rend sous le seuil', async () => {
    const { fetchDriveNodes } = await import('./api')
    const mockNodes = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      tenant_id: 1,
      user_id: 1,
      parent_id: null,
      name: `Item ${i + 1}`,
      is_folder: i % 3 === 0,
      size: 1024 * (i + 1),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    vi.mocked(fetchDriveNodes).mockResolvedValue(mockNodes as never)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const start = performance.now()
    render(wrap(<DrivePage />, client))
    // Les noms peuvent être rendus via différents nœuds (badges/troncature) : on cherche exactement "Item 1".
    await screen.findByText((content) => content.trim() === 'Item 1', { timeout: 10_000 })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(PERF.PAGE_RENDER_MS)
  })

  it('AppHub se rend sous le seuil', () => {
    const start = performance.now()
    render(wrap(<AppHub />))
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy()
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(PERF.HUB_RENDER_MS)
  })

  it('Clic sur un bouton Drive (Nouveau dossier) reste réactif', async () => {
    const { fetchDriveNodes } = await import('./api')
    vi.mocked(fetchDriveNodes).mockResolvedValue([])

    render(wrap(<DrivePage />))
    await screen.findByRole('button', { name: 'Nouveau dossier', timeout: 3000 })

    const start = performance.now()
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau dossier' }))
    await screen.findByPlaceholderText('Nom du dossier', { timeout: PERF.INTERACTION_MS })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(PERF.INTERACTION_MS)
  })

  it('Clic sur Téléverser (label) ne bloque pas', async () => {
    const { fetchDriveNodes } = await import('./api')
    vi.mocked(fetchDriveNodes).mockResolvedValue([])

    render(wrap(<DrivePage />))
    await screen.findByRole('button', { name: 'Nouveau dossier', timeout: 3000 })

    const start = performance.now()
    fireEvent.click(screen.getByText('Téléverser'))
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(PERF.INTERACTION_MS)
  })
})
