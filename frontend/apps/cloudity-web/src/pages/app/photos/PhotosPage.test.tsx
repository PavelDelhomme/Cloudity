import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotosPage from './PhotosPage'
import { useAuth } from '../../../authContext'
import * as api from '../../../api'

vi.mock('../../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../../api', () => ({
  fetchDrivePhotosTimeline: vi.fn(),
  fetchDrivePhotosArchive: vi.fn(),
  fetchDrivePhotosLocked: vi.fn(),
  fetchDriveNodes: vi.fn(),
  fetchDriveTrash: vi.fn(),
  downloadDriveFile: vi.fn(),
  downloadDriveThumbnail: vi.fn(),
  uploadDriveFileWithProgress: vi.fn(),
  createDriveFolder: vi.fn(),
  deleteDriveNode: vi.fn(),
  restoreDriveNode: vi.fn(),
  archiveDrivePhotos: vi.fn(),
  unarchiveDrivePhotos: vi.fn(),
  lockDrivePhotos: vi.fn(),
  unlockDrivePhotos: vi.fn(),
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
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    queryClient.clear()
    vi.mocked(api.fetchDrivePhotosTimeline).mockResolvedValue({
      items: [],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    vi.mocked(api.fetchDriveNodes).mockResolvedValue([])
    vi.mocked(api.fetchDriveTrash).mockResolvedValue([])
    vi.mocked(api.fetchDrivePhotosArchive).mockResolvedValue([])
    vi.mocked(api.fetchDrivePhotosLocked).mockResolvedValue([])
    vi.mocked(api.restoreDriveNode).mockResolvedValue(undefined)
    vi.mocked(api.archiveDrivePhotos).mockResolvedValue({ updated: 1 })
    vi.mocked(api.unarchiveDrivePhotos).mockResolvedValue({ updated: 1 })
    vi.mocked(api.lockDrivePhotos).mockResolvedValue({ updated: 1 })
    vi.mocked(api.unlockDrivePhotos).mockResolvedValue({ updated: 1 })
    vi.mocked(api.downloadDriveFile).mockResolvedValue(
      new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    )
    vi.mocked(api.deleteDriveNode).mockResolvedValue(undefined)
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
    expect(await screen.findByText(/Aucune photo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Importer des photos' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Navigation Photos' })).toBeTruthy()
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

  it('n’affiche pas l’overlay de téléversement pour un drag interne de vignette', async () => {
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
          id: 43,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'internal-drag.jpg',
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
    const photo = await screen.findByRole('button', { name: /Ouvrir internal-drag\.jpg/ })
    fireEvent.dragEnter(photo, {
      dataTransfer: {
        types: ['Files', 'text/uri-list', 'text/html'],
      },
    })
    expect(screen.queryByText('Relâchez pour importer')).toBeNull()
  })

  it('affiche l’overlay de téléversement pour un drag externe de fichiers', async () => {
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
          id: 44,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'external-drag.jpg',
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
    const photo = await screen.findByRole('button', { name: /Ouvrir external-drag\.jpg/ })
    fireEvent.dragEnter(photo, {
      dataTransfer: {
        types: ['Files'],
      },
    })
    expect(screen.getByText('Relâchez pour importer')).toBeTruthy()
  })

  it('clic droit sur une photo active la sélection et coche la photo', async () => {
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
          id: 31,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'context.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    fireEvent.contextMenu(await screen.findByRole('button', { name: /Ouvrir context\.jpg/ }))
    expect(screen.getByText('1 sélectionnée')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Désélectionner context\.jpg/ })).toBeTruthy()
    expect(screen.getByRole('menu', { name: /Actions pour context\.jpg/ })).toBeTruthy()
  })

  it('menu contextuel : archiver appelle archiveDrivePhotos pour la photo', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
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
          id: 32,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'context-archive.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    fireEvent.contextMenu(await screen.findByRole('button', { name: /Ouvrir context-archive\.jpg/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archiver' }))
    await waitFor(() => {
      expect(api.archiveDrivePhotos).toHaveBeenCalledWith('token', [32])
    })
    vi.unstubAllGlobals()
  })

  it('la coche de date sélectionne toutes les photos de la section', async () => {
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
          id: 41,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'day-a.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
        {
          id: 42,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'day-b.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T18:00:00.000Z',
          updated_at: '2026-01-10T18:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    fireEvent.click(await screen.findByRole('button', { name: 'Sélectionner 10 janvier 2026' }))
    expect(screen.getByText('2 sélectionnées')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Désélectionner day-a\.jpg/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Désélectionner day-b\.jpg/ })).toBeTruthy()
  })

  it('affiche le bouton Paramètres Photos', async () => {
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
    expect(await screen.findByRole('button', { name: 'Paramètres Photos' })).toBeTruthy()
  })

  it('mode sélection : archiver appelle archiveDrivePhotos pour les photos choisies', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
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
          id: 10,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'a.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    await screen.findByRole('button', { name: /Ouvrir a\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner' }))
    fireEvent.click(screen.getByRole('button', { name: /Sélectionner a\.jpg/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Archiver la sélection' }))
    await waitFor(() => {
      expect(api.archiveDrivePhotos).toHaveBeenCalledWith('token', [10])
    })
    vi.unstubAllGlobals()
  })

  it('mode sélection : verrouiller appelle lockDrivePhotos pour les photos choisies', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
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
          id: 12,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'lock.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    await screen.findByRole('button', { name: /Ouvrir lock\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner' }))
    fireEvent.click(screen.getByRole('button', { name: /Sélectionner lock\.jpg/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller la sélection' }))
    await waitFor(() => {
      expect(api.lockDrivePhotos).toHaveBeenCalledWith('token', [12])
    })
    vi.unstubAllGlobals()
  })

  it('Échap quitte le mode sélection sur la chronologie', async () => {
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
          id: 50,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'esc.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    await screen.findByRole('button', { name: /Ouvrir esc\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner' }))
    fireEvent.click(screen.getByRole('button', { name: /Sélectionner esc\.jpg/ }))
    expect(screen.getByText('1 sélectionnée')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('1 sélectionnée')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sélectionner' })).toBeTruthy()
  })

  it('mode sélection : corbeille appelle deleteDriveNode pour les photos choisies', async () => {
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
          id: 10,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'a.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
        {
          id: 11,
          tenant_id: 1,
          user_id: 1,
          parent_id: null,
          name: 'b.jpg',
          is_folder: false,
          size: 5,
          mime_type: 'image/jpeg',
          created_at: '2026-01-10T12:00:00.000Z',
          updated_at: '2026-01-10T12:00:00.000Z',
        },
      ],
      limit: 48,
      offset: 0,
      has_more: false,
    })
    render(wrap(<PhotosPage />))
    await screen.findByRole('button', { name: /Ouvrir a\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner' }))
    fireEvent.click(screen.getByRole('button', { name: /Sélectionner a\.jpg/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à la corbeille' }))
    await waitFor(() => {
      expect(api.deleteDriveNode).toHaveBeenCalledWith('token', 10)
    })
  })

  it('onglet Archivé : restaurer appelle unarchiveDrivePhotos', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchDrivePhotosArchive).mockResolvedValue([
      {
        id: 77,
        tenant_id: 1,
        user_id: 1,
        parent_id: null,
        name: 'archived.jpg',
        is_folder: false,
        size: 5,
        mime_type: 'image/jpeg',
        created_at: '2026-01-10T12:00:00.000Z',
        updated_at: '2026-01-10T12:00:00.000Z',
        photo_archived_at: '2026-01-11T12:00:00.000Z',
      },
    ])
    render(
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={['/app/photos?tab=archive']}>
          <PhotosPage />
        </TestRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('button', { name: /Ouvrir archived\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    await waitFor(() => {
      expect(api.unarchiveDrivePhotos).toHaveBeenCalledWith('token', [77])
    })
  })

  it('onglet Verrouillé : déverrouiller appelle unlockDrivePhotos', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchDrivePhotosLocked).mockResolvedValue([
      {
        id: 88,
        tenant_id: 1,
        user_id: 1,
        parent_id: null,
        name: 'locked.jpg',
        is_folder: false,
        size: 5,
        mime_type: 'image/jpeg',
        created_at: '2026-01-10T12:00:00.000Z',
        updated_at: '2026-01-10T12:00:00.000Z',
        photo_locked_at: '2026-01-11T12:00:00.000Z',
      },
    ])
    render(
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={['/app/photos?tab=locked']}>
          <PhotosPage />
        </TestRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('button', { name: /Ouvrir locked\.jpg/ })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => {
      expect(api.unlockDrivePhotos).toHaveBeenCalledWith('token', [88])
    })
  })

  it('onglet Albums : Nouvel album appelle createDriveFolder et exclut le dossier Photos', async () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchDriveNodes).mockResolvedValue([
      {
        id: 1,
        tenant_id: 1,
        user_id: 1,
        parent_id: null,
        name: 'Photos',
        is_folder: true,
        size: 0,
        mime_type: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      {
        id: 2,
        tenant_id: 1,
        user_id: 1,
        parent_id: null,
        name: 'Vacances',
        is_folder: true,
        size: 0,
        mime_type: null,
        created_at: '2026-01-02',
        updated_at: '2026-01-02',
      },
    ])
    vi.mocked(api.createDriveFolder).mockResolvedValue({
      id: 99,
      tenant_id: 1,
      user_id: 1,
      parent_id: null,
      name: 'Été',
      is_folder: true,
      size: 0,
      mime_type: null,
      created_at: '2026-01-03',
      updated_at: '2026-01-03',
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={['/app/photos?tab=albums']}>
          <PhotosPage />
        </TestRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('link', { name: /Vacances/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Photos$/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel album' }))
    fireEvent.change(screen.getByPlaceholderText('Vacances 2026'), { target: { value: 'Été' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => {
      expect(api.createDriveFolder).toHaveBeenCalledWith('token', null, 'Été')
    })
  })
})
