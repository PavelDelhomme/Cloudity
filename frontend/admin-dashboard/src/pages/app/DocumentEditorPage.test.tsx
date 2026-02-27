import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '../../test-utils'
import DocumentEditorPage, { EDITABLE_EXT, getExtension, isRich } from './DocumentEditorPage'
import { useAuth } from '../../authContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  getDriveNodeContentAsText: vi.fn().mockResolvedValue(''),
  putDriveNodeContent: vi.fn().mockResolvedValue({ id: 1, size: 0 }),
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
}))

function wrap(ui: React.ReactElement, nodeId = '1') {
  return (
    <TestRouter initialEntries={[`/app/office/editor/${nodeId}`]}>
      <Routes>
        <Route path="/app/office/editor/:nodeId" element={ui} />
      </Routes>
    </TestRouter>
  )
}

describe('DocumentEditorPage', () => {
  beforeEach(() => {
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
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Drive' })).toBeTruthy()
  })
})

describe('DocumentEditorPage helpers', () => {
  it('EDITABLE_EXT contains .txt, .md, .html', () => {
    expect(EDITABLE_EXT).toContain('.txt')
    expect(EDITABLE_EXT).toContain('.md')
    expect(EDITABLE_EXT).toContain('.html')
  })

  it('getExtension returns extension in lowercase', () => {
    expect(getExtension('doc.html')).toBe('.html')
    expect(getExtension('file.TXT')).toBe('.txt')
    expect(getExtension('noext')).toBe('')
  })

  it('isRich returns true only for .html', () => {
    expect(isRich('a.html')).toBe(true)
    expect(isRich('a.txt')).toBe(false)
    expect(isRich('a.md')).toBe(false)
  })
})
