import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DrivePage from './DrivePage'
import AppLayout from '../../layouts/AppLayout'
import { useAuth } from '../../authContext'
import { UploadProvider } from '../../UploadProvider'
import { DRIVE_FILE_INPUT_ID, DRIVE_FOLDER_INPUT_ID } from '../../uploadContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
  fetchDriveTrash: vi.fn().mockResolvedValue([]),
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

  it('renders Drive title and onglets Drive / Corbeille', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corbeille' })).toBeTruthy()
  })

  it('avec layout, le fil d’Ariane en haut contient Tableau de bord et Drive', () => {
    render(wrapWithLayout())
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Fil d\'Ariane' }).textContent).toMatch(/Drive/)
  })

  it('renders Téléverser and Nouveau dossier', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByText('Téléverser')).toBeTruthy()
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

  it('clicking Téléverser (label) does not throw', () => {
    render(wrap(<DrivePage />))
    const uploadLabel = screen.getByText('Téléverser')
    expect(() => fireEvent.click(uploadLabel)).not.toThrow()
  })

  it('clicking Dossier (label) does not throw', () => {
    render(wrap(<DrivePage />))
    const folderLabel = screen.getByText('Dossier')
    expect(() => fireEvent.click(folderLabel)).not.toThrow()
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

  it('toolbar and list render without throwing after multiple re-renders', async () => {
    const { rerender } = render(wrap(<DrivePage />))
    await screen.findByText(/Aucun fichier ni dossier ici/)
    for (let i = 0; i < 10; i++) {
      rerender(wrap(<DrivePage />))
    }
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy()
  })

  it('shows empty state when no nodes', async () => {
    render(wrap(<DrivePage />))
    await screen.findByText(/Aucun fichier ni dossier ici/)
    expect(screen.getByText(/Créez un dossier ou téléversez un fichier/)).toBeTruthy()
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

  it('labels Téléverser/Dossier ont le bon htmlFor (inputs dans AppLayout)', () => {
    render(wrap(<DrivePage />))
    const uploadLabel = screen.getByText('Téléverser').closest('label')
    const folderLabel = screen.getByText('Dossier').closest('label')
    expect(uploadLabel?.getAttribute('for')).toBe(DRIVE_FILE_INPUT_ID)
    expect(folderLabel?.getAttribute('for')).toBe(DRIVE_FOLDER_INPUT_ID)
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
      const fileInput = document.getElementById(DRIVE_FILE_INPUT_ID) as HTMLInputElement
      const label = screen.getByText('Téléverser').closest('label')
      expect(label?.getAttribute('for')).toBe(DRIVE_FILE_INPUT_ID)
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

    it('affiche un tableau avec colonnes Nom, Taille quand il y a des nœuds', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByRole('button', { name: /Nom/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Taille/ })).toBeTruthy()
      expect(screen.getByText('Mon dossier')).toBeTruthy()
      expect(screen.getByText('Doc.docx')).toBeTruthy()
    })

    it('affiche le nombre de dossiers/fichiers pour un dossier (1er niveau)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.getByText(/2 dossier/)).toBeTruthy()
      expect(screen.getByText(/3 fichier/)).toBeTruthy()
    })

    it('sélection style Google: clic sur une ligne affiche la barre de sélection', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      expect(screen.queryByText(/sélectionné\(s\)/)).toBeNull()
      const row = screen.getByText('Mon dossier').closest('tr')
      expect(row).toBeTruthy()
      if (row) fireEvent.click(row)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      expect(screen.getByRole('button', { name: /Tout désélectionner/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Supprimer la sélection/ })).toBeTruthy()
    })

    it('pas de case à cocher: sélection par clic sur la ligne', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const checkboxes = document.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(0)
      const row = screen.getByText('Doc.docx').closest('tr')
      if (row) fireEvent.click(row)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
    })

    it('Échap désélectionne les éléments', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      if (row) fireEvent.click(row)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.keyDown(window, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByText(/sélectionné\(s\)/)).toBeNull())
    })

    it('Suppr ouvre la modal de confirmation de suppression (corbeille)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      if (row) fireEvent.click(row)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.keyDown(window, { key: 'Delete' })
      await waitFor(() => expect(screen.getByText(/Déplacer dans la corbeille \?/)).toBeTruthy())
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Déplacer dans la corbeille/ })).toBeTruthy()
    })

    it('clic sur Supprimer la sélection ouvre la modal (pas confirm du navigateur)', async () => {
      const { fetchDriveNodes } = await import('../../api')
      vi.mocked(fetchDriveNodes).mockResolvedValue([mockFolder as never, mockFile as never])
      render(wrap(<DrivePage />))
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 })
      const row = screen.getByText('Doc.docx').closest('tr')
      if (row) fireEvent.click(row)
      await waitFor(() => expect(screen.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: /Supprimer la sélection/ }))
      await waitFor(() => expect(screen.getByText(/Déplacer dans la corbeille \?/)).toBeTruthy())
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
