import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DrivePage from './DrivePage'
import { useAuth } from '../../authContext'
import { UploadProvider } from '../../uploadContext'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api', () => ({
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
  createDriveFolder: vi.fn(),
  renameDriveNode: vi.fn(),
  deleteDriveNode: vi.fn(),
  downloadDriveFile: vi.fn(),
  uploadDriveFile: vi.fn(),
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

  it('shows empty state when no nodes', async () => {
    render(wrap(<DrivePage />))
    await screen.findByText(/Aucun fichier ni dossier ici/)
    expect(screen.getByText(/Créez un dossier ou téléversez un fichier/)).toBeTruthy()
  })
})
