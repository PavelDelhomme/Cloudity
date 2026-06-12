import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContactsPage from './ContactsPage'
import { useAuth } from '../../../authContext'
import * as api from '../../../api'
import { grantAppLockedVaultSession, setupAppLockedPin } from '../appLockedVault'

vi.mock('../../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../../api', () => ({
  fetchContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('ContactsPage', () => {
  beforeEach(() => {
    queryClient.clear()
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(api.fetchContacts).mockResolvedValue([])
  })

  it('renders Contacts title and description', async () => {
    render(wrap(<ContactsPage />))
    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeTruthy()
    expect(screen.getByText(/Google Contacts/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ouvrir Mail/ })).toBeTruthy()
  })

  it('shows Nouveau contact button', () => {
    render(wrap(<ContactsPage />))
    expect(screen.getByRole('button', { name: 'Nouveau contact' })).toBeTruthy()
  })

  it('affiche le bouton Paramètres Contacts', () => {
    render(wrap(<ContactsPage />))
    expect(screen.getByRole('button', { name: 'Paramètres Contacts' })).toBeTruthy()
  })

  it('shows empty state when no contacts', async () => {
    render(wrap(<ContactsPage />))
    await screen.findByText(/Aucun contact/)
    expect(screen.getByText(/Ajoutez-en un pour les retrouver comme destinataires dans Mail/)).toBeTruthy()
  })

  it('shows contact list when contacts exist', async () => {
    vi.mocked(api.fetchContacts).mockResolvedValue([
      { id: 1, name: 'Jean Dupont', email: 'jean@exemple.fr', phone: '+33 6 12 34 56 78' },
      { id: 2, name: '', email: 'marie@test.fr', phone: '' },
    ])
    render(wrap(<ContactsPage />))
    await screen.findByText('Jean Dupont')
    expect(screen.getByText('jean@exemple.fr')).toBeTruthy()
    expect(screen.getByText('marie@test.fr')).toBeTruthy()
  })

  it('paramètres : affiche le téléphone dans la liste', async () => {
    vi.mocked(api.fetchContacts).mockResolvedValue([
      { id: 1, name: 'Jean Dupont', email: 'jean@exemple.fr', phone: '+33 6 12 34 56 78' },
    ])
    render(wrap(<ContactsPage />))

    await screen.findByText('Jean Dupont')
    expect(screen.queryByText('+33 6 12 34 56 78')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres Contacts' }))
    fireEvent.click(screen.getByLabelText('Afficher le téléphone dans la liste'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText('+33 6 12 34 56 78')
  })

  it('confirme avant suppression et respecte Annuler', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.mocked(api.fetchContacts).mockResolvedValue([
      { id: 1, name: 'Jean Dupont', email: 'jean@exemple.fr', phone: '+33 6 12 34 56 78' },
    ])
    render(wrap(<ContactsPage />))

    await screen.findByText('Jean Dupont')
    fireEvent.click(screen.getByText('Jean Dupont'))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(confirmSpy).toHaveBeenCalledWith('Supprimer le contact « Jean Dupont » ?')
    await waitFor(() => {
      expect(api.deleteContact).not.toHaveBeenCalled()
    })
    confirmSpy.mockRestore()
  })

  it('coffre local : bloque les contacts avant déverrouillage puis charge après PIN', async () => {
    localStorage.setItem(
      'cloudity.contacts.appSettings.v1',
      JSON.stringify({
        sortAlphabetically: true,
        showPhoneInList: false,
        confirmDelete: true,
        defaultImportDuplicateMode: 'skip',
        lockEnabled: true,
      })
    )
    await setupAppLockedPin('contacts', '1:contacts:user@test.com', '1234', '1234')
    vi.mocked(api.fetchContacts).mockClear()

    render(wrap(<ContactsPage />))

    await screen.findByText('Coffre Contacts verrouillé')
    expect(api.fetchContacts).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller avec le code' }))

    await waitFor(() => {
      expect(api.fetchContacts).toHaveBeenCalledWith('token')
    })
  })

  it('coffre local : affiche l’état ouvert dans l’interface Contacts', async () => {
    localStorage.setItem(
      'cloudity.contacts.appSettings.v1',
      JSON.stringify({
        sortAlphabetically: true,
        showPhoneInList: false,
        confirmDelete: true,
        defaultImportDuplicateMode: 'skip',
        lockEnabled: true,
      })
    )
    await setupAppLockedPin('contacts', '1:contacts:user@test.com', '1234', '1234')
    grantAppLockedVaultSession('contacts', '1:contacts:user@test.com')

    render(wrap(<ContactsPage />))

    expect(await screen.findByText('Coffre Contacts local ouvert')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Verrouiller Contacts' }).length).toBeGreaterThan(0)
  })
})
