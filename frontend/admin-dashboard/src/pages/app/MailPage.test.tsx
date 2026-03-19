import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MailPage from './MailPage'
import { useAuth } from '../../authContext'
import { useNotifications } from '../../notificationsContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../notificationsContext', () => ({ useNotifications: vi.fn() }))
vi.mock('../../api', () => ({
  fetchMailAccounts: vi.fn(),
  fetchMailMessages: vi.fn(),
  fetchMailMessage: vi.fn(),
  markMailMessageRead: vi.fn(),
  moveMailMessageToFolder: vi.fn().mockResolvedValue({ ok: true, folder: 'trash' }),
  syncMailAccount: vi.fn(),
  sendMailMessage: vi.fn(),
  getMailGoogleOAuthRedirectUrl: vi.fn(),
  fetchContacts: vi.fn().mockResolvedValue([]),
  createMailAccount: vi.fn(),
  deleteMailAccount: vi.fn(),
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
}))

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter initialEntries={['/app/mail']}>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

const mockAddNotification = vi.fn()

describe('MailPage', () => {
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
    vi.mocked(useNotifications).mockReturnValue({
      notifications: [],
      addNotification: mockAddNotification,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    })
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([])
    vi.mocked(api.fetchMailMessages).mockResolvedValue([])
    vi.mocked(api.syncMailAccount).mockResolvedValue({ synced: 0 })
    vi.mocked(api.moveMailMessageToFolder).mockClear()
    mockAddNotification.mockClear()
  })

  it('renders Mail title when authenticated', async () => {
    render(wrap(<MailPage />))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mail' })).toBeTruthy()
    })
  })

  it('shows empty state when no mail accounts', async () => {
    render(wrap(<MailPage />))
    await waitFor(() => {
      expect(screen.getByText(/Aucune boîte mail reliée/)).toBeTruthy()
    })
  })

  it('syncs from IMAP when opening mail box (one account)', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.syncMailAccount).mockResolvedValue({ synced: 0 })
    render(wrap(<MailPage />))
    await waitFor(() => {
      expect(api.syncMailAccount).toHaveBeenCalledWith('token', 1, undefined)
    })
  })

  it('notifies when sync returns new messages', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.syncMailAccount).mockResolvedValue({ synced: 2 })
    render(wrap(<MailPage />))
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Boîte mail',
          message: '2 nouveaux messages',
          type: 'info',
        })
      )
    })
  })

  it('notifies "1 nouveau message" when sync returns exactly one', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.syncMailAccount).mockResolvedValue({ synced: 1 })
    render(wrap(<MailPage />))
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Boîte mail',
          message: '1 nouveau message',
          type: 'info',
        })
      )
    })
  })

  it('affiche la pagination avec total (Page 1 / 2)', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 1,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Sujet 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      total: 26,
    } as any)

    render(wrap(<MailPage />))
    expect(await screen.findByText(/Page 1 \/ 2/)).toBeTruthy()
  })

  it('permet la sélection multiple et le déplacement en corbeille', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])

    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 1,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Sujet 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 2,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Sujet 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))

    const cb1 = await screen.findByRole('checkbox', { name: /Sujet 1/ })
    const cb2 = await screen.findByRole('checkbox', { name: /Sujet 2/ })

    // Utilise le bouton "Tout sélectionner (page)" pour éviter la fragilité
    // des events checkbox en jsdom.
    const toggleAllBtn = await screen.findByRole('button', { name: 'Tout sélectionner (page)' })
    fireEvent.click(toggleAllBtn)

    const bulkTrashBtn = await screen.findByRole('button', { name: 'Corbeille en masse' })
    fireEvent.click(bulkTrashBtn)

    await waitFor(() => {
      expect(api.moveMailMessageToFolder).toHaveBeenCalledTimes(2)
      expect(api.moveMailMessageToFolder).toHaveBeenCalledWith('token', 1, 1, 'trash')
      expect(api.moveMailMessageToFolder).toHaveBeenCalledWith('token', 1, 2, 'trash')
    })
  })

  it('permet la sélection inversée (page)', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])

    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 1,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Sujet 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 2,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Sujet 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))

    const toggleAllBtn = await screen.findByRole('button', { name: 'Tout sélectionner (page)' })
    fireEvent.click(toggleAllBtn)

    const invertBtn = await screen.findByRole('button', { name: 'Inverser la sélection (page)' })
    fireEvent.click(invertBtn)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Corbeille en masse' })).toBeNull()
    })
  })

  it('permet l’archivage en masse (déplacement vers Envoyés)', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])

    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 10,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Archive 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 11,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Archive 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))

    const toggleAllBtn = await screen.findByRole('button', { name: 'Tout sélectionner (page)' })
    fireEvent.click(toggleAllBtn)

    const bulkArchiveBtn = await screen.findByRole('button', { name: 'Archiver en masse' })
    fireEvent.click(bulkArchiveBtn)

    await waitFor(() => {
      expect(api.moveMailMessageToFolder).toHaveBeenCalledWith('token', 1, 10, 'sent')
      expect(api.moveMailMessageToFolder).toHaveBeenCalledWith('token', 1, 11, 'sent')
    })
  })
})
