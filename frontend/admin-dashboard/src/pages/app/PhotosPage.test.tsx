import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotosPage from './PhotosPage'
import { useAuth } from '../../authContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDrivePhotosTimeline: vi.fn(),
  fetchDriveNodes: vi.fn(),
  downloadDriveFile: vi.fn(),
  uploadDriveFileWithProgress: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('PhotosPage', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.mocked(api.fetchDrivePhotosTimeline).mockResolvedValue({
      items: [],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    vi.mocked(api.fetchDriveNodes).mockResolvedValue([])
    vi.mocked(api.downloadDriveFile).mockResolvedValue(
      new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    )
  })

  it('affiche le titre Photos', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PhotosPage />))
    expect(screen.getByRole('heading', { name: 'Photos' })).toBeTruthy()
    await screen.findByText(/Aucune photo pour l’instant/)
  })

  it('sans token, invite à se connecter', () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: null,
      tenantId: 1,
      email: null,
      refreshToken: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    render(wrap(<PhotosPage />))
    expect(screen.getByText(/Connectez-vous pour voir vos photos/)).toBeTruthy()
  })

  it('regroupe les photos par jour avec un titre de section', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchDrivePhotosTimeline).mockResolvedValue({
      items: [
        {
          id: 2,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'recent.jpg',
          is_folder: false,
          size: 10,
          mime_type: 'image/jpeg',
          created_at: '2026-06-15T18:00:00.000Z',
          updated_at: '2026-06-15T18:00:00.000Z',
        },
        {
          id: 1,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'older.jpg',
          is_folder: false,
          size: 10,
          mime_type: 'image/jpeg',
          created_at: '2026-06-01T12:00:00.000Z',
          updated_at: '2026-06-01T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    expect(await screen.findByRole('heading', { name: '15 juin 2026' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '1 juin 2026' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ouvrir recent\.jpg/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ouvrir older\.jpg/ })).toBeTruthy()
  })

  it('affiche une vignette quand la timeline renvoie une image', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchDrivePhotosTimeline).mockResolvedValue({
      items: [
        {
          id: 42,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'test.jpg',
          is_folder: false,
          size: 12,
          mime_type: 'image/jpeg',
          created_at: '2026-01-01',
          updated_at: '2026-01-02',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    expect(await screen.findByRole('button', { name: /Ouvrir test\.jpg/ })).toBeTruthy()
  })
})
