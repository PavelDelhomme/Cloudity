import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DrivePage from './DrivePage'
import AppLayout from '../../layouts/AppLayout'
import { useAuth } from '../../authContext'
import { UploadProvider } from '../../UploadProvider'
import { DRIVE_FILE_INPUT_ID, DRIVE_FOLDER_INPUT_ID } from '../../uploadContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
  createDriveFolder: vi.fn().mockResolvedValue({ id: 1 }),
  renameDriveNode: vi.fn(),
  deleteDriveNode: vi.fn(),
  downloadDriveFile: vi.fn(),
  uploadDriveFile: vi.fn(),
  uploadDriveFileWithProgress: vi.fn().mockResolvedValue({ id: 1, name: 'f', size: 0 }),
  moveDriveNode: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </UploadProvider>
    </QueryClientProvider>
  )
}

/** Monte AppLayout + route Drive pour avoir les vrais inputs fichier/dossier dans le DOM (comme en prod). */
function wrapWithLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/drive']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route path="drive" element={<DrivePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
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

  it('renders Drive title and breadcrumb', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByRole('heading', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
  })

  it('renders Téléverser and Nouveau dossier', () => {
    render(wrap(<DrivePage />))
    expect(screen.getByText('Téléverser')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeTruthy()
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
      const fileInput = document.getElementById(DRIVE_FILE_INPUT_ID)
      const folderInput = document.getElementById(DRIVE_FOLDER_INPUT_ID)
      expect(fileInput).toBeTruthy()
      expect(folderInput).toBeTruthy()
      expect((fileInput as HTMLInputElement).type).toBe('file')
      expect((folderInput as HTMLInputElement).type).toBe('file')
    })

    it('clic sur label Téléverser puis simulation sélection fichier → fichier apparaît dans l’overlay (sans ouvrir le dialogue OS)', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      const fileInput = document.getElementById(DRIVE_FILE_INPUT_ID) as HTMLInputElement
      expect(fileInput).toBeTruthy()
      const label = screen.getByText('Téléverser').closest('label')
      expect(label?.getAttribute('for')).toBe(DRIVE_FILE_INPUT_ID)
      const file = new File(['contenu test'], 'fichier-a-televerser.txt', { type: 'text/plain' })
      fireEvent.change(fileInput, { target: { files: [file] } })
      await screen.findByText('fichier-a-televerser.txt')
    })

    it('simulation sélection dossier (FileList avec webkitRelativePath) → entrées dans l’overlay', async () => {
      render(wrapWithLayout())
      await screen.findByRole('heading', { name: 'Drive' })
      const folderInput = document.getElementById(DRIVE_FOLDER_INPUT_ID) as HTMLInputElement
      expect(folderInput).toBeTruthy()
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
})
