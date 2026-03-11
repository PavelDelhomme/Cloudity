import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '../../test-utils'
import DocumentEditorPage, { EDITABLE_EXT, getExtension, isRich, isWordDocument } from './DocumentEditorPage'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  getDriveNodeContentAsText: vi.fn().mockResolvedValue(''),
  putDriveNodeContent: vi.fn().mockResolvedValue({ id: 1, size: 0 }),
  putDriveNodeContentBlob: vi.fn().mockResolvedValue({ id: 1, size: 0 }),
  renameDriveNode: vi.fn().mockResolvedValue({ id: 1, name: 'x.docx' }),
  moveDriveNode: vi.fn().mockResolvedValue({ id: 1, name: 'x.docx', parent_id: null }),
  deleteDriveNode: vi.fn().mockResolvedValue(undefined),
  downloadDriveFile: vi.fn().mockResolvedValue(new Blob()),
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement, nodeId = '1', initialState?: { from: 'office' } | { from: 'drive'; breadcrumb: { id: number | null; name: string }[] }) {
  const entry = initialState
    ? { pathname: `/app/office/editor/${nodeId}`, state: initialState }
    : `/app/office/editor/${nodeId}`
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/office/editor/:nodeId" element={ui} />
          <Route path="/app/office" element={<div data-testid="office-landing">Office</div>} />
          <Route path="/app/drive" element={<div data-testid="drive-landing">Drive</div>} />
        </Routes>
      </TestRouter>
    </QueryClientProvider>
  )
}

describe('DocumentEditorPage', () => {
  beforeEach(() => {
    // jsdom n'implémente pas document.execCommand (éditeur riche)
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(true), configurable: true, writable: true })
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'u@t.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('shows invalid id message when nodeId is not a positive integer', () => {
    render(wrap(<DocumentEditorPage />, '0'))
    expect(screen.getByText(/Identifiant de document invalide/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Retour au Drive/ })).toBeTruthy()
  })

  it('shows invalid id message when nodeId is NaN', () => {
    render(wrap(<DocumentEditorPage />, 'abc'))
    expect(screen.getByText(/Identifiant de document invalide/)).toBeTruthy()
  })

  it('renders loading then editor for valid nodeId', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('Contenu initial')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Test.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    const saveBtn = await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })
    expect(saveBtn).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Drive' })).toBeTruthy()
  })

  it('shows breadcrumb with Drive link, document name, and rename button next to title for rich doc', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Hi</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const nav = screen.getByRole('navigation', { name: /Fil d'Ariane/ })
    expect(within(nav).getByRole('link', { name: 'Drive' })).toBeTruthy()
    expect(screen.getByText('Doc.html')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Renommer le document/ })).toBeTruthy()
  })

  it('shows menu bar Fichier, Édition, Affichage, Insertion, Format for rich document', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Content</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    expect(screen.getByRole('button', { name: /Fichier/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Édition/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Affichage/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Insertion/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Format/ })).toBeTruthy()
  })

  it('Renommer opens modal and submit calls renameDriveNode', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes, renameDriveNode } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const renameBtn = screen.getByRole('button', { name: /Renommer/ })
    fireEvent.click(renameBtn)

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Renommer le document/ })).toBeTruthy())
    const dialog = screen.getByRole('dialog', { name: /Renommer le document/ })
    const input = within(dialog).getByRole('textbox', { name: /Nom du fichier/ })
    fireEvent.change(input, { target: { value: 'Nouveau nom.docx' } })
    const submitBtn = within(dialog).getByRole('button', { name: /Enregistrer/ })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(renameDriveNode).toHaveBeenCalledWith('token', 1, 'Nouveau nom.docx')
    })
  })

  it('Supprimer opens modal and confirm calls deleteDriveNode', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes, deleteDriveNode } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const fileMenuBtn = screen.getByRole('button', { name: /Fichier/ })
    fireEvent.click(fileMenuBtn)
    const deleteBtn = await screen.findByRole('button', { name: /^Supprimer$/ })
    fireEvent.click(deleteBtn)

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Déplacer dans la corbeille/ })).toBeTruthy())

    const dialog = screen.getByRole('dialog', { name: /Déplacer dans la corbeille/ })
    const confirmBtn = within(dialog).getByRole('button', { name: /Déplacer dans la corbeille/ })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deleteDriveNode).toHaveBeenCalledWith('token', 1)
    })
  })

  it('Fermer from office state navigates to /app/office', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Hi</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1', { from: 'office' }))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const closeBtn = screen.getByRole('button', { name: /Fermer/ })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.getByTestId('office-landing')).toBeTruthy()
      expect(screen.getByText('Office')).toBeTruthy()
    })
  })

  it('Fermer from drive state navigates to /app/drive', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Hi</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1', { from: 'drive', breadcrumb: [{ id: null, name: 'Drive' }] }))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const closeBtn = screen.getByRole('button', { name: /Fermer/ })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.getByTestId('drive-landing')).toBeTruthy()
      expect(screen.getByText('Drive')).toBeTruthy()
    })
  })

  it('Insertion > Lien opens custom modal and submit inserts link', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Texte</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Insertion/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Lien$/ }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Insérer un lien/ })).toBeTruthy())
    const urlInput = screen.getByRole('textbox', { name: /URL/i })
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Insérer$/ }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Insérer un lien/ })).toBeNull())
  })

  it('Insertion > Tableau opens custom modal and submit inserts table', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Texte</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1'))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Insertion/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Tableau$/ }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Insérer un tableau/ })).toBeTruthy())
    const rowsInput = screen.getByRole('spinbutton', { name: /Nombre de lignes/i })
    const colsInput = screen.getByRole('spinbutton', { name: /Nombre de colonnes/i })
    fireEvent.change(rowsInput, { target: { value: '4' } })
    fireEvent.change(colsInput, { target: { value: '5' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Insérer$/ }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Insérer un tableau/ })).toBeNull())
  })

  it('Fermer with dirty shows quit confirm modal; Annuler keeps editor', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Hi</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1', { from: 'office' }))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const editor = document.querySelector('[contenteditable="true"]')
    if (editor) fireEvent.input(editor, { target: { innerHTML: '<p>Hi modified</p>' } })

    const closeBtn = screen.getByRole('button', { name: /Fermer/ })
    fireEvent.click(closeBtn)

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Modifications non enregistrées/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Modifications non enregistrées/ })).toBeNull());
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeTruthy()
  })

  it('Fermer with dirty and Quitter in modal navigates away', async () => {
    const { getDriveNodeContentAsText, fetchDriveNodes } = await import('../../api')
    vi.mocked(getDriveNodeContentAsText).mockResolvedValue('<p>Hi</p>')
    vi.mocked(fetchDriveNodes)
      .mockResolvedValueOnce([{ id: 1, name: 'Doc.html', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }])
      .mockResolvedValue([])

    render(wrap(<DocumentEditorPage />, '1', { from: 'office' }))
    await screen.findByRole('button', { name: /Enregistrer/ }, { timeout: 3000 })

    const editor = document.querySelector('[contenteditable="true"]')
    if (editor) fireEvent.input(editor, { target: { innerHTML: '<p>Hi modified</p>' } })

    fireEvent.click(screen.getByRole('button', { name: /Fermer/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Modifications non enregistrées/ })).toBeTruthy())
    const dialog = screen.getByRole('dialog', { name: /Modifications non enregistrées/ })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Quitter$/ }))

    await waitFor(() => {
      expect(screen.getByTestId('office-landing')).toBeTruthy()
    })
  })
})

describe('DocumentEditorPage helpers', () => {
  it('EDITABLE_EXT contains .txt, .md, .html, .csv, .xlsx, .doc, .docx', () => {
    expect(EDITABLE_EXT).toContain('.txt')
    expect(EDITABLE_EXT).toContain('.md')
    expect(EDITABLE_EXT).toContain('.html')
    expect(EDITABLE_EXT).toContain('.csv')
    expect(EDITABLE_EXT).toContain('.xlsx')
    expect(EDITABLE_EXT).toContain('.doc')
    expect(EDITABLE_EXT).toContain('.docx')
  })

  it('getExtension returns extension in lowercase', () => {
    expect(getExtension('doc.html')).toBe('.html')
    expect(getExtension('file.TXT')).toBe('.txt')
    expect(getExtension('noext')).toBe('')
  })

  it('isRich returns true for .html, .docx, .doc', () => {
    expect(isRich('a.html')).toBe(true)
    expect(isRich('a.docx')).toBe(true)
    expect(isRich('a.doc')).toBe(true)
    expect(isRich('a.txt')).toBe(false)
    expect(isRich('a.md')).toBe(false)
  })

  it('isWordDocument returns true for .doc and .docx', () => {
    expect(isWordDocument('a.docx')).toBe(true)
    expect(isWordDocument('a.doc')).toBe(true)
    expect(isWordDocument('a.html')).toBe(false)
  })
})
