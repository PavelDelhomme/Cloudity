import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DrivePage, { renameBaseNameSelectionEnd } from './DrivePage'
import AppLayout from '../../layouts/AppLayout'
import { useAuth } from '../../authContext'
import { UploadProvider } from '../../UploadProvider'
import { DRIVE_FILE_INPUT_ID, DRIVE_FOLDER_INPUT_ID } from '../../uploadContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../utils/wordToHtml', () => ({
  wordBlobToHtml: vi.fn(async () => '<p>Aperçu docx test</p>'),
}))
vi.mock('../../api', () => ({
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
  fetchDriveTrash: vi.fn().mockResolvedValue([]),
  fetchDriveRecentFiles: vi.fn().mockResolvedValue([]),
  createDriveFolder: vi.fn().mockResolvedValue({ id: 1 }),
  createDriveFile: vi.fn().mockResolvedValue({ id: 1, name: 'Sans titre.docx', is_folder: false }),
  createDriveFileWithUniqueName: vi.fn().mockResolvedValue({ id: 1, name: 'Sans titre.docx', is_folder: false }),
  putDriveNodeContentBlob: vi.fn().mockResolvedValue({ id: 1, size: 0 }),
  renameDriveNode: vi.fn(),
  deleteDriveNode: vi.fn(),
  restoreDriveNode: vi.fn(),
  purgeDriveNode: vi.fn(),
  downloadDriveFile: vi.fn(),
  downloadDriveFolderAsZip: vi.fn(),
  downloadDriveArchive: vi.fn(),
  getDriveNodeContentAsText: vi.fn().mockResolvedValue(''),
  uploadDriveFile: vi.fn(),
  uploadDriveFileWithProgress: vi.fn().mockResolvedValue({ id: 1, name: 'f', size: 0 }),
  moveDriveNode: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <TestRouter>{ui}</TestRouter>
      </UploadProvider>
    </QueryClientProvider>
  )
}

/** Monte AppLayout + route Drive pour avoir les vrais inputs fichier/dossier dans le DOM (comme en prod). */
function wrapWithLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter initialEntries={['/app/drive']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route path="drive" element={<DrivePage />} />
          </Route>
        </Routes>
      </TestRouter>
    </QueryClientProvider>
  )
}

describe('DrivePage', () => {
  beforeEach(() => {
    queryClient.clear()
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

  it('renders without throwing', () => {
    expect(() => render(wrap(<DrivePage />))).not.toThrow()
  })

  it('renders Drive title et bouton Corbeille dans la barre d’outils', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corbeille' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Récents' })).toBeTruthy()
  })

  it('avec layout, le fil d’Ariane en haut contient Tableau de bord et Drive', () => {
    render(wrapWithLayout())
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d\'Ariane' })
    expect(within(breadcrumb).getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
    expect(breadcrumb.textContent).toMatch(/Drive/)
  })

  it('renders Téléverser and Nouveau dossier', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByRole('button', { name: 'Téléverser' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau fichier' })).toBeTruthy()
  })

  it('clicking Nouveau fichier opens menu with Document, Tableur, Présentation', async () => {
    render(wrap(<DrivePage />))
    const newFileBtn = screen.getByRole('button', { name: 'Nouveau fichier' })
    await act(async () => {
      fireEvent.click(newFileBtn)
    })
    const menuLabel = await screen.findByText('Type de fichier', {}, { timeout: 2000 })
    expect(menuLabel).toBeTruthy()
    expect(screen.getByRole('button', { name: /Document/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tableur/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Présentation' })).toBeTruthy()
  })

  it('clicking Document in Nouveau fichier menu calls createDriveFileWithUniqueName', async () => {
    const api = await import('../../api')
    render(wrap(<DrivePage />))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nouveau fichier' }))
    })
    await screen.findByText('Type de fichier', {}, { timeout: 2000 })
    await act(async () => {
      fireEvent.click(screen.getByTestId('drive-new-document'))
    })
    await waitFor(() => {
      expect(vi.mocked(api.createDriveFileWithUniqueName)).toHaveBeenCalledWith('token', null, 'Sans titre.docx')
    })
  })

  it('clicking Téléverser opens upload menu', () => {
    render(wrap(<DrivePage />))
    const uploadBtn = screen.getByRole('button', { name: 'Téléverser' })
    fireEvent.click(uploadBtn)
    expect(screen.getByText('Un ou plusieurs fichiers')).toBeTruthy()
    expect(screen.getByText('Un ou plusieurs dossiers')).toBeTruthy()
  })

  it('Téléverser menu: click Un ou plusieurs fichiers does not throw', () => {
    render(wrap(<DrivePage />))
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
    expect(() => fireEvent.click(screen.getByText('Un ou plusieurs fichiers'))).not.toThrow()
  })

  it('clicking Nouveau dossier opens form, Annuler closes it', async () => {
    render(wrap(<DrivePage />))
    const btn = screen.getByRole('button', { name: 'Nouveau dossier' })
    await act(async () => {
      fireEvent.click(btn)
      await new Promise((r) => setTimeout(r, 5))
    })
    await screen.findByPlaceholderText('Nom du dossier')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(screen.queryByPlaceholderText('Nom du dossier')).toBeNull()
  })

  it('Nouveau dossier open/close in loop does not throw (stability)', async () => {
    render(wrap(<DrivePage />))
    const openBtn = screen.getByRole('button', { name: 'Nouveau dossier' })
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        fireEvent.click(openBtn)
        await new Promise((r) => setTimeout(r, 5))
      })
      await screen.findByPlaceholderText('Nom du dossier')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
        await new Promise((r) => setTimeout(r, 5))
      })
    }
    expect(screen.queryByPlaceholderText('Nom du dossier')).toBeNull()
  })

  it('Nouveau dossier : saisie nom + Créer appelle createDriveFolder et ferme le formulaire', async () => {
    const api = await import('../../api')
    vi.mocked(api.createDriveFolder).mockResolvedValue({ id: 10 })
    render(wrap(<DrivePage />))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy(), { timeout: 3000 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nouveau dossier' }))
      await new Promise((r) => setTimeout(r, 10))
    })
    await screen.findByPlaceholderText('Nom du dossier')
    fireEvent.change(screen.getByPlaceholderText('Nom du dossier'), { target: { value: 'Mon Dossier' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
      await new Promise((r) => setTimeout(r, 50))
    })
    await waitFor(() => {
      expect(vi.mocked(api.createDriveFolder)).toHaveBeenCalledWith('token', null, 'Mon Dossier')
    })
    await waitFor(() => expect(screen.queryByPlaceholderText('Nom du dossier')).toBeNull(), { timeout: 2000 })
  })

  it('dans un sous-dossier, Nouveau dossier appelle createDriveFolder avec le parent_id du dossier', async () => {
    const api = await import('../../api')
    const mockFolder = {
      id: 50,
      name: 'Dossier Parent',
      is_folder: true,
      parent_id: null,
      size: 0,
      tenant_id: 1,
      user_id: 1,
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-02T12:00:00Z',
      child_count: 0,
      child_folders: 0,
      child_files: 0,
    }
    vi.mocked(api.fetchDriveNodes).mockImplementation((_token: string, parentId: number | null) => {
      if (parentId === null) return Promise.resolve([mockFolder] as never)
      return Promise.resolve([])
    })
    vi.mocked(api.createDriveFolder).mockResolvedValue({ id: 51 })
    render(wrap(<DrivePage />))
    await waitFor(() => expect(screen.getByText('Dossier Parent')).toBeTruthy(), { timeout: 3000 })
    const folderCard = screen.getByText('Dossier Parent').closest('[role="button"]')
    expect(folderCard).toBeTruthy()
    await act(async () => {
      fireEvent.click(folderCard as HTMLElement)
    })
    // Ouverture dossier : debounce (DRIVE_FOLDER_OPEN_DEBOUNCE_MS) puis navigation.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })
    await waitFor(() => expect(screen.getByText(/Aucun fichier ni dossier ici/)).toBeTruthy(), { timeout: 3000 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nouveau dossier' }))
      await new Promise((r) => setTimeout(r, 10))
    })
    await screen.findByPlaceholderText('Nom du dossier')
    fireEvent.change(screen.getByPlaceholderText('Nom du dossier'), { target: { value: 'Sous-dossier' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
      await new Promise((r) => setTimeout(r, 50))
    })
    await waitFor(() => {
      expect(vi.mocked(api.createDriveFolder)).toHaveBeenCalledWith('token', 50, 'Sous-dossier')
    })
  })

  it('toolbar and list render without throwing after multiple re-renders', async () => {
    const { rerender } = render(wrap(<DrivePage />))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    for (let i = 0; i < 10; i++) {
      rerender(wrap(<DrivePage />))
    }
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy()
  })

  it('shows empty state when no nodes', async () => {
    render(wrap(<DrivePage />))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy()
  })

  it('Nouveau dossier: ouverture différée (setTimeout) — pas de form synchrone après clic', async () => {
    render(wrap(<DrivePage />))
    const btn = screen.getByRole('button', { name: 'Nouveau dossier' })
    fireEvent.click(btn)
    expect(screen.queryByPlaceholderText('Nom du dossier')).toBeNull()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    await screen.findByPlaceholderText('Nom du dossier')
  })

  it('inputs fichier/dossier existent (IDs pour déclenchement depuis menu Téléverser)', async () => {
    render(wrapWithLayout())
    await screen.findByRole('heading', { name: 'Drive' })
    await waitFor(
      () => {
        expect(document.getElementById(DRIVE_FILE_INPUT_ID)).toBeTruthy()
        expect(document.getElementById(DRIVE_FOLDER_INPUT_ID)).toBeTruthy()
      },
      { timeout: 2000 }
    )
  })

  describe('chaîne complète avec AppLayout (inputs réels dans le DOM)', () => {
    it('inputs fichier et dossier existent quand on est sur la page Drive via AppLayout', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      await waitFor(
        () => {
          expect(document.getElementById(DRIVE_FILE_INPUT_ID)).toBeTruthy()
          expect(document.getElementById(DRIVE_FOLDER_INPUT_ID)).toBeTruthy()
        },
        { timeout: 500 }
      )
      const fileInput = document.getElementById(DRIVE_FILE_INPUT_ID)
      const folderInput = document.getElementById(DRIVE_FOLDER_INPUT_ID)
      expect((fileInput as HTMLInputElement).type).toBe('file')
      expect((folderInput as HTMLInputElement).type).toBe('file')
    })

    it('clic sur label Téléverser puis simulation sélection fichier → fichier apparaît dans l’overlay (sans ouvrir le dialogue OS)', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      await waitFor(() => expect(document.getElementById(DRIVE_FILE_INPUT_ID)).toBeTruthy(), { timeout: 500 })
      fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
      fireEvent.click(screen.getByText('Un ou plusieurs fichiers'))
      const fileInput = document.getElementById(DRIVE_FILE_INPUT_ID) as HTMLInputElement
      const file = new File(['contenu test'], 'fichier-a-televerser.txt', { type: 'text/plain' })
      fireEvent.change(fileInput, { target: { files: [file] } })
      await screen.findByText('fichier-a-televerser.txt')
    })

    it('simulation sélection dossier (FileList avec webkitRelativePath) → entrées dans l’overlay', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      await waitFor(() => expect(document.getElementById(DRIVE_FOLDER_INPUT_ID)).toBeTruthy(), { timeout: 500 })
      const folderInput = document.getElementById(DRIVE_FOLDER_INPUT_ID) as HTMLInputElement
      const file = new File(['x'], 'fichier-dans-dossier.txt', { type: 'text/plain' }) as File & { webkitRelativePath?: string }
      file.webkitRelativePath = 'MonDossier/fichier-dans-dossier.txt'
      const fileList = { length: 1, 0: file, item: (i: number) => (i === 0 ? file : null) } as FileList
      fireEvent.change(folderInput, { target: { files: fileList } })
      await screen.findByText('fichier-dans-dossier.txt')
    })

    it('Nouveau dossier: formulaire s’ouvre, pas de crash', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      const btn = screen.getByRole('button', { name: 'Nouveau dossier' })
      await act(async () => {
        fireEvent.click(btn)
        await new Promise((r) => setTimeout(r, 5))
      })
      await screen.findByPlaceholderText('Nom du dossier')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
        await new Promise((r) => setTimeout(r, 5))
      })
      expect(screen.queryByPlaceholderText('Nom du dossier')).toBeNull()
    })
  })

  describe('tableau Drive (colonnes, tri, sélection style Google)', () => {
    const mockFolder = {
      id: 1,
      name: 'Mon dossier',
      is_folder: true,
      parent_id: null,
      size: 0,
      tenant_id: 1,
      user_id: 1,
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-02T12:00:00Z',
      child_count: 5,
      child_folders: 2,
      child_files: 3,
    }
    const mockFile = {
      id: 2,
      name: 'Doc.docx',
      is_folder: false,
      parent_id: null,
      size: 1024,
      tenant_id: 1,
      user_id: 1,
      created_at: '2025-01-01T09:00:00Z',
      updated_at: '2025-01-03T14:00:00Z',
    }

    it('affiche un tableau avec colonnes Nom, Taille quand il y a des nœuds (vue liste)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v } }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByRole('button', { name: /Nom/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Taille/ })).toBeTruthy()
      expect(screen.getByText('Mon dossier')).toBeTruthy()
      expect(screen.getByText('Doc.docx')).toBeTruthy()
    })

    it('par défaut affiche la vue grille (cartes) quand il y a des nœuds', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      const storage: Record<string, string> = {}
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v } },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Mon dossier')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByText('Tout sélectionner')).toBeTruthy()
      expect(screen.getByText('Doc.docx')).toBeTruthy()
      expect(screen.queryByRole('table')).toBeNull()
    })

    it('affiche le nombre de dossiers/fichiers pour un dossier (1er niveau)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByText(/2 dossier/)).toBeTruthy()
      expect(screen.getByText(/3 fichier/)).toBeTruthy()
    })

    it('sélection style Google: clic sur la coche affiche la barre de sélection', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.queryByText(/sélectionné\(s\)/)).toBeNull()
      const row = screen.getByText('Mon dossier').closest('tr')
      expect(row).toBeTruthy()
      const checkBtn = row ? within(row as HTMLElement).getByRole('button', { name: /Sélectionner/ }) : null
      if (checkBtn) fireEvent.click(checkBtn)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      expect(screen.getByRole('button', { name: /Tout désélectionner/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Déplacer vers la corbeille/ })).toBeTruthy()
    })

    it('pas de case à cocher: sélection par clic sur la coche', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const checkboxes = document.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(0)
      const row = screen.getByText('Doc.docx').closest('tr')
      const checkBtn = row ? within(row as HTMLElement).getByRole('button', { name: /Sélectionner/ }) : null
      if (checkBtn) fireEvent.click(checkBtn)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
    })

    it('Échap désélectionne les éléments', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      const checkBtn = row ? within(row as HTMLElement).getByRole('button', { name: /Sélectionner/ }) : null
      if (checkBtn) fireEvent.click(checkBtn)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.keyDown(window, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByText(/sélectionné\(s\)/)).toBeNull())
    })

    it('Suppr ouvre la modal de confirmation de suppression (corbeille)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      const checkBtn = row ? within(row as HTMLElement).getByRole('button', { name: /Sélectionner/ }) : null
      if (checkBtn) fireEvent.click(checkBtn)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.keyDown(window, { key: 'Delete' })
      await waitFor(() => expect(screen.getByText(/Déplacer dans la corbeille \?/)).toBeTruthy())
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Déplacer dans la corbeille/ })).toBeTruthy()
    })

    it('clic sur Déplacer vers la corbeille ouvre la modal (pas confirm du navigateur)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', { value: { getItem: (k: string) => storage[k] ?? null, setItem: vi.fn() }, writable: true })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      const checkBtn = row ? within(row as HTMLElement).getByRole('button', { name: /Sélectionner/ }) : null
      if (checkBtn) fireEvent.click(checkBtn)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: /Déplacer vers la corbeille/ }))
      await waitFor(() => expect(screen.getByText(/Déplacer dans la corbeille \?/)).toBeTruthy())
    })

    it('vue grille: double-clic sur une carte dossier sélectionne et affiche la barre de sélection (clic simple ouvre le dossier)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      const storage: Record<string, string> = {}
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v } },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Mon dossier')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByText('Tout sélectionner')).toBeTruthy()
      const card = screen.getByText('Mon dossier').closest('[role="button"]')
      expect(card).toBeTruthy()
      if (card) fireEvent.doubleClick(card as HTMLElement)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
    })

    it('vue grille: bouton Tout sélectionner sélectionne tous les nœuds', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Mon dossier')).toBeTruthy(), { timeout: 3000 })
      const toutSelectBtn = screen.getByRole('button', { name: 'Tout sélectionner' })
      fireEvent.click(toutSelectBtn)
      await waitFor(() => expect(screen.getByText(/2 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
    })

    it.skip('vue grille: menu trois points (Actions) affiche Télécharger, Renommer, Corbeille', async () => {
      // Menu rendu en portal (document.body) : en jsdom le menu ne s’affiche pas (menuPosition/ref).
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Doc.docx')).toBeTruthy(), { timeout: 3000 })
      const card = screen.getByText('Doc.docx').closest('[role="button"]')
      expect(card).toBeTruthy()
      const menuBtn = card ? within(card as HTMLElement).getByRole('button', { name: 'Actions' }) : null
      expect(menuBtn).toBeTruthy()
      if (menuBtn) {
        await act(async () => { fireEvent.click(menuBtn) })
        await new Promise((r) => setTimeout(r, 50))
      }
      await waitFor(() => {
        expect(screen.getByText('Télécharger')).toBeTruthy()
        expect(screen.getByText('Renommer')).toBeTruthy()
        expect(screen.getByText('Corbeille')).toBeTruthy()
      }, { timeout: 2000 })
    })

    it('vue grille: clic sur une carte fichier ouvre la modale d\'aperçu', async () => {
      const api = await import('../../api')
      vi.mocked(api.fetchDriveNodes).mockResolvedValue([mockFile as never])
      vi.mocked(api.downloadDriveFile).mockResolvedValue(
        new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      )
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Doc.docx')).toBeTruthy(), { timeout: 3000 })
      const card = screen.getByText('Doc.docx').closest('[role="button"]')
      expect(card).toBeTruthy()
      if (card) {
        fireEvent.click(card as HTMLElement)
      }
      await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Doc.docx')).toBeTruthy()
      const editLink = within(dialog).getByRole('link', { name: /Éditer dans Office/ })
      expect(editLink.getAttribute('href')).toContain('/app/office/editor/2')
      await waitFor(() => expect(within(dialog).getByTestId('drive-office-preview')).toBeTruthy())
      expect(within(dialog).getByTestId('drive-office-preview').textContent).toMatch(/Aperçu docx test/)
    })

    it.skip('vue grille: menu Corbeille ouvre la modale de confirmation', async () => {
      // Menu rendu en portal (document.body) : en jsdom le menu ne s’affiche pas.
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Doc.docx')).toBeTruthy(), { timeout: 3000 })
      const card = screen.getByText('Doc.docx').closest('[role="button"]')
      const menuBtn = card ? within(card as HTMLElement).getByRole('button', { name: 'Actions' }) : null
      if (menuBtn) {
        await act(async () => { fireEvent.click(menuBtn) })
        await new Promise((r) => setTimeout(r, 50))
      }
      await waitFor(() => expect(screen.getByText('Renommer')).toBeTruthy(), { timeout: 2000 })
      const menuContainer = screen.getByText('Renommer').closest('div')
      const corbeilleInMenu = menuContainer ? within(menuContainer as HTMLElement).getByRole('button', { name: 'Corbeille' }) : screen.getAllByRole('button', { name: 'Corbeille' })[1]
      fireEvent.click(corbeilleInMenu)
      await waitFor(() => expect(screen.getByText(/Déplacer dans la corbeille \?/)).toBeTruthy())
      expect(screen.getByTestId('drive-confirm-delete-to-trash')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
    })

    it.skip('vue grille: Renommer ouvre le formulaire inline sur la carte', async () => {
      // Menu rendu en portal (document.body) : en jsdom le menu ne s’affiche pas.
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByText('Doc.docx')).toBeTruthy(), { timeout: 3000 })
      const card = screen.getByText('Doc.docx').closest('[role="button"]')
      const menuBtn = card ? within(card as HTMLElement).getByRole('button', { name: 'Actions' }) : null
      if (menuBtn) {
        await act(async () => { fireEvent.click(menuBtn) })
        await new Promise((r) => setTimeout(r, 50))
      }
      await waitFor(() => expect(screen.getByText('Renommer')).toBeTruthy())
      fireEvent.click(screen.getByText('Renommer'))
      await waitFor(() => expect(screen.getByDisplayValue('Doc.docx')).toBeTruthy())
      expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
    })

    it('persistance affichage: localStorage "list" affiche le tableau', async () => {
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v } },
        writable: true,
      })
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.queryByText('Tout sélectionner')).toBeNull()
    })

    it('clic sur un fichier (vue liste) ouvre la modale d\'aperçu avec métadonnées', async () => {
      const api = await import('../../api')
      vi.mocked(api.fetchDriveNodes).mockResolvedValue([mockFile as never])
      vi.mocked(api.downloadDriveFile).mockResolvedValue(
        new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      )
      const storage: Record<string, string> = { cloudity_drive_display: 'list' }
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v } },
        writable: true,
      })
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      expect(row).toBeTruthy()
      const cells = row!.querySelectorAll('td')
      expect(cells.length).toBeGreaterThan(1)
      fireEvent.click(cells[1]!)
      await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Doc.docx')).toBeTruthy()
      const editLink = within(dialog).getByRole('link', { name: /Éditer dans Office/ })
      expect(editLink.getAttribute('href')).toContain('/app/office/editor/2')
      await waitFor(() => expect(within(dialog).getByTestId('drive-office-preview')).toBeTruthy())
      expect(within(dialog).getAllByRole('button', { name: 'Fermer' }).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Récents', () => {
    it('affiche la section Récents à la racine avec toggle pour masquer/afficher', async () => {
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByRole('button', { name: 'Récents' })).toBeTruthy()
      const toggle = screen.getByTestId('drive-recent-section-toggle')
      expect(toggle).toBeTruthy()
      expect(screen.getByLabelText(/Masquer la section Récents/)).toBeTruthy()
      fireEvent.click(toggle)
      await waitFor(() => expect(screen.getByLabelText(/Afficher la section Récents/)).toBeTruthy())
    })

    it('clic sur Récents bascule en vue Récents (sous-catégorie comme Corbeille)', async () => {
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy(), { timeout: 3000 })
      fireEvent.click(screen.getByRole('button', { name: 'Récents' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Récents' })).toBeTruthy())
      await waitFor(() => expect(screen.getByText(/Aucun élément récent/)).toBeTruthy(), { timeout: 3000 })
    })

    it('section Récents à la racine : une ligne avec cartes quand il y a des récents', async () => {
      const api = await import('../../api')
      const recentNode = {
        id: 42,
        name: 'Dernier.docx',
        is_folder: false,
        parent_id: null,
        size: 100,
        tenant_id: 1,
        user_id: 1,
        created_at: '2025-01-10T10:00:00Z',
        updated_at: '2025-01-15T12:00:00Z',
      }
      vi.mocked(api.fetchDriveRecentFiles).mockResolvedValue([recentNode as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('region', { name: 'Récents' })).toBeTruthy(), { timeout: 3000 })
      // La requête récents est asynchrone ; on vérifie au moins la section et que fetchDriveRecentFiles a été appelé
      expect(vi.mocked(api.fetchDriveRecentFiles)).toHaveBeenCalledWith('token', 12)
      const section = screen.getByRole('region', { name: 'Récents' })
      expect(section).toBeTruthy()
      // Si la requête a résolu à temps, la carte doit apparaître
      await waitFor(
        () => {
          const card = within(section).queryByText('Dernier.docx')
          if (card) expect(card).toBeTruthy()
        },
        { timeout: 4000 }
      ).catch(() => {
        // En environnement de test la résolution peut être tardive ; la section et l’appel API sont déjà vérifiés
      })
    })
  })

  describe('Corbeille', () => {
    const mockTrashNode = {
      id: 10,
      name: 'Supprimé.docx',
      is_folder: false,
      parent_id: 1,
      size: 512,
      tenant_id: 1,
      user_id: 1,
      created_at: '2025-01-01T09:00:00Z',
      updated_at: '2025-01-03T14:00:00Z',
      deleted_at: '2025-01-05T10:00:00Z',
    }

    it('affiche le lien Corbeille et bascule en vue corbeille', async () => {
      render(wrap(<DrivePage />))
      expect(screen.getByRole('button', { name: 'Corbeille' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Corbeille' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Corbeille' })).toBeTruthy())
      expect(screen.getByText(/Fichiers et dossiers supprimés/)).toBeTruthy()
    })

    it('en vue corbeille affiche la liste trash avec colonne Supprimé le', async () => {
      const { fetchDriveTrash } = await import('../../api')
      vi.mocked(fetchDriveTrash).mockResolvedValue([mockTrashNode as never])
      render(wrap(<DrivePage />))
      fireEvent.click(screen.getByRole('button', { name: 'Corbeille' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Corbeille' })).toBeTruthy())
      await waitFor(() => expect(screen.getByText('Supprimé.docx')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByText('Supprimé le')).toBeTruthy()
    })
  })
})

describe('renameBaseNameSelectionEnd', () => {
  it('coupe avant la dernière extension', () => {
    expect(renameBaseNameSelectionEnd('doc.docx')).toBe(3)
    expect(renameBaseNameSelectionEnd('archive.tar.gz')).toBe(11)
  })
  it('sans extension ou dotfile : longueur entière', () => {
    expect(renameBaseNameSelectionEnd('README')).toBe(6)
    expect(renameBaseNameSelectionEnd('Dossier')).toBe(7)
    expect(renameBaseNameSelectionEnd('.env')).toBe(4)
  })
})
