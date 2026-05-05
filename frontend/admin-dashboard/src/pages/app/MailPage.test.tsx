import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestRouter } from '../../test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MailPage from './MailPage'
import { useAuth } from '../../authContext'
import { useNotifications } from '../../notificationsContext'
import { AppPageChromeProvider } from '../../appPageChromeContext'
import * as api from '../../api'

vi.mock('../../authContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../notificationsContext', () => ({ useNotifications: vi.fn() }))
vi.mock('../../api', () => ({
  apiUrl: vi.fn((path: string) => path),
  fetchMailAccounts: vi.fn(),
  fetchMailMessages: vi.fn(),
  fetchUnifiedMailMessages: vi.fn(),
  fetchMailMessage: vi.fn(),
  downloadMailAttachment: vi.fn(),
  markMailMessageRead: vi.fn(),
  markMailMessagesReadBulk: vi.fn().mockResolvedValue({ ok: true, updated: 0, requested: 0, read: true }),
  moveMailMessageToFolder: vi.fn().mockResolvedValue({ ok: true, folder: 'trash' }),
  moveMailMessagesToFolderBulk: vi.fn().mockResolvedValue({ ok: true, updated: 0, requested: 0, folder: 'trash' }),
  deleteMailMessagePermanently: vi.fn().mockResolvedValue({ ok: true }),
  syncMailAccount: vi.fn(),
  sendMailMessage: vi.fn(),
  getMailGoogleOAuthRedirectUrl: vi.fn(),
  fetchContacts: vi.fn().mockResolvedValue([]),
  createCalendarEvent: vi.fn().mockResolvedValue({ id: 1 }),
  createMailAccount: vi.fn(),
  deleteMailAccount: vi.fn(),
  fetchDriveNodes: vi.fn().mockResolvedValue([]),
  fetchMailAliases: vi.fn().mockResolvedValue([]),
  fetchMailFilterRules: vi.fn().mockResolvedValue([]),
  fetchMailImapFolders: vi.fn().mockResolvedValue([]),
  createMailImapFolder: vi.fn().mockResolvedValue({ ok: true, imap_path: 'INBOX.Test' }),
  renameMailImapFolder: vi.fn().mockResolvedValue({ ok: true, imap_path: 'INBOX.Test2' }),
  deleteMailImapFolder: vi.fn().mockResolvedValue({ ok: true }),
  fetchMailTags: vi.fn().mockResolvedValue([]),
  createMailTag: vi.fn().mockResolvedValue({ id: 1, name: 'test' }),
  putMailMessageTags: vi.fn().mockResolvedValue({ ok: true }),
  fetchMailFolderSummary: vi.fn().mockResolvedValue({
    inbox: { total: 0, unread: 0 },
    sent: { total: 0, unread: 0 },
    drafts: { total: 0, unread: 0 },
    archive: { total: 0, unread: 0 },
    spam: { total: 0, unread: 0 },
    trash: { total: 0, unread: 0 },
    extra: [],
  }),
  createMailAlias: vi.fn(),
  patchMailAlias: vi.fn().mockResolvedValue({ ok: true }),
  deleteMailAlias: vi.fn(),
  fetchVaults: vi.fn().mockResolvedValue([]),
  fetchVaultItems: vi.fn().mockResolvedValue([]),
  deleteMailFilterRule: vi.fn().mockResolvedValue({ ok: true }),
  patchMailFilterRule: vi.fn().mockResolvedValue({ ok: true }),
  createMailFilterRule: vi.fn().mockResolvedValue({ id: 1 }),
  applyMailFilterRules: vi.fn().mockResolvedValue({ ok: true, applied: 0 }),
  updateMailAccount: vi.fn(),
  createContact: vi.fn().mockResolvedValue({ id: 1, email: 'x@test.com', name: '' }),
}))

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TestRouter initialEntries={['/app/mail']}>
        <AppPageChromeProvider>{ui}</AppPageChromeProvider>
      </TestRouter>
    </QueryClientProvider>
  )
}

/**
 * Active le mode sélection comme dans l’UI : clic sur l’avatar (bouton « Sélectionner le message … »).
 * (L’ancien bouton global « Sélectionner des messages » n’existe plus ; le menu ⋮ propose aussi « Sélectionner ».)
 */
async function enterMailSelectionModeFromList(messageSubject: string) {
  await screen.findByText(messageSubject)
  fireEvent.click(
    await screen.findByRole('button', { name: `Sélectionner le message ${messageSubject}` })
  )
}

const mockAddNotification = vi.fn()

describe('MailPage', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      tenantId: 1,
      email: 'user@test.com',
      refreshToken: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAccessTokenIfNeeded: vi.fn().mockResolvedValue('token'),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useNotifications).mockReturnValue({
      notifications: [],
      addNotification: mockAddNotification,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    })
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([])
    vi.mocked(api.fetchMailMessages).mockResolvedValue([])
    vi.mocked(api.fetchUnifiedMailMessages).mockResolvedValue({ messages: [], total: 0 })
    vi.mocked(api.fetchMailAliases).mockResolvedValue([])
    vi.mocked(api.syncMailAccount).mockResolvedValue({ synced: 0 })
    vi.mocked(api.moveMailMessageToFolder).mockClear()
    vi.mocked(api.moveMailMessagesToFolderBulk).mockClear()
    vi.mocked(api.markMailMessagesReadBulk).mockClear()
    mockAddNotification.mockClear()
  })

  it('affiche la barre Courrier (nouveau message) lorsque des comptes existent', async () => {
    vi.mocked(api.fetchMailAccounts).mockImplementation(async () => [
      { id: 1, email: 'a@test.com', label: 'Test', imap_host: 'h', imap_port: 993, smtp_host: 's', smtp_port: 587 } as any,
    ])
    render(wrap(<MailPage />))
    await waitFor(() => expect(vi.mocked(api.fetchMailAccounts)).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /Nouveau/i }, { timeout: 15_000 })).toBeTruthy()
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
      expect(api.syncMailAccount).toHaveBeenCalledWith('token', 1, undefined, undefined)
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
          title: 'Nouveau courrier',
          message: 'user@test.com — 2 nouveaux messages',
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
          title: 'Nouveau courrier',
          message: 'user@test.com — 1 nouveau message',
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
    expect(screen.getByRole('button', { name: 'Page suivante' }).disabled).toBe(false)
  })

  it('affiche un seul menu actions message (bouton … ou clic droit)', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 42,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Sujet menu unique',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      total: 1,
    } as any)

    render(wrap(<MailPage />))
    await screen.findByText('Sujet menu unique')

    fireEvent.click(await screen.findByRole('button', { name: 'Menu actions message' }))
    expect(await screen.findAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: /Sélectionner/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Menu actions message' }))
    await waitFor(() => {
      expect(screen.queryAllByRole('menu')).toHaveLength(0)
    })

    const row = screen.getByText('Sujet menu unique').closest('li') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 80, clientY: 120 })
    expect(await screen.findAllByRole('menu')).toHaveLength(1)
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

    await enterMailSelectionModeFromList('Sujet 1')

    const cb1 = await screen.findByRole('checkbox', { name: /Sujet 1/ })
    const cb2 = await screen.findByRole('checkbox', { name: /Sujet 2/ })

    // Utilise le bouton "Tout sélectionner (page)" pour éviter la fragilité
    // des events checkbox en jsdom.
    const toggleAllBtn = await screen.findByRole('button', { name: 'Tout sélectionner (page)' })
    fireEvent.click(toggleAllBtn)

    const bulkTrashBtn = await screen.findByRole('button', { name: 'Corbeille en masse' })
    fireEvent.click(bulkTrashBtn)

    await waitFor(() => {
      expect(api.moveMailMessagesToFolderBulk).toHaveBeenCalledTimes(1)
      expect(api.moveMailMessagesToFolderBulk).toHaveBeenCalledWith('token', 1, [1, 2], 'trash')
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

    await enterMailSelectionModeFromList('Sujet 1')
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

    await enterMailSelectionModeFromList('Archive 1')
    const toggleAllBtn = await screen.findByRole('button', { name: 'Tout sélectionner (page)' })
    fireEvent.click(toggleAllBtn)

    const bulkArchiveBtn = await screen.findByRole('button', { name: 'Archives en masse' })
    fireEvent.click(bulkArchiveBtn)

    await waitFor(() => {
      expect(api.moveMailMessagesToFolderBulk).toHaveBeenCalledWith('token', 1, [10, 11], 'archive')
    })
  })

  it('marque en masse comme lu via endpoint batch', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 21,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Read 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 22,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Read 2',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))
    await enterMailSelectionModeFromList('Read 1')
    fireEvent.click(await screen.findByRole('button', { name: 'Tout sélectionner (page)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme lu en masse' }))

    await waitFor(() => {
      expect(api.markMailMessagesReadBulk).toHaveBeenCalledTimes(1)
      expect(api.markMailMessagesReadBulk).toHaveBeenCalledWith('token', 1, [21, 22], true)
    })
  })

  it('marque en masse comme non lu via endpoint batch', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 31,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Unread 1',
          created_at: new Date().toISOString(),
          is_read: true,
        },
        {
          id: 32,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Unread 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))
    await enterMailSelectionModeFromList('Unread 1')
    fireEvent.click(await screen.findByRole('button', { name: 'Tout sélectionner (page)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme non lu en masse' }))

    await waitFor(() => {
      expect(api.markMailMessagesReadBulk).toHaveBeenCalledTimes(1)
      expect(api.markMailMessagesReadBulk).toHaveBeenCalledWith('token', 1, [31, 32], false)
    })
  })

  it('déplace en masse vers spam via endpoint batch', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 41,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Spam 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 42,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Spam 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))
    await enterMailSelectionModeFromList('Spam 1')
    fireEvent.click(await screen.findByRole('button', { name: 'Tout sélectionner (page)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Spam en masse' }))

    await waitFor(() => {
      expect(api.moveMailMessagesToFolderBulk).toHaveBeenCalledWith('token', 1, [41, 42], 'spam')
    })
  })

  it('remet en masse en réception via endpoint batch', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 51,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Inbox 1',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 52,
          account_id: 1,
          folder: 'inbox',
          from: 'c@test.com',
          to: 'd@test.com',
          subject: 'Inbox 2',
          created_at: new Date().toISOString(),
          is_read: true,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))
    await enterMailSelectionModeFromList('Inbox 1')
    fireEvent.click(await screen.findByRole('button', { name: 'Tout sélectionner (page)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Boîte de réception en masse' }))

    await waitFor(() => {
      expect(api.moveMailMessagesToFolderBulk).toHaveBeenCalledWith('token', 1, [51, 52], 'inbox')
    })
  })

  it('affiche les alias sous la boîte sélectionnée et appelle fetchMailAliases', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailAliases).mockResolvedValue([
      { id: 10, account_id: 1, alias_email: 'alias@exemple.fr', label: 'Travail', created_at: new Date().toISOString() },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({ messages: [], total: 0 } as any)

    render(wrap(<MailPage />))

    await waitFor(() => {
      expect(api.fetchMailAliases).toHaveBeenCalledWith('token', 1)
    })
    expect(await screen.findByRole('button', { name: /alias@exemple\.fr/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Toutes les adresses/i })).toBeTruthy()
  })

  it('affiche l’icône indésirable probable quand spam_score ≥ 52 en boîte de réception', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 1,
          account_id: 1,
          folder: 'inbox',
          from: 'spammer@test.com',
          to: 'user@test.com',
          subject: 'Promo',
          created_at: new Date().toISOString(),
          is_read: false,
          spam_score: 60,
        },
      ],
      total: 1,
    } as any)

    render(wrap(<MailPage />))

    const warn = await screen.findByTitle(/Indésirable probable \(score 60\/100\)/i)
    expect(warn).toBeTruthy()
  })

  it(
    'passe à la page suivante des messages et relance fetchMailMessages avec offset',
    async () => {
      vi.mocked(api.fetchMailAccounts).mockResolvedValue([
        { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
      ])
      const msgs = (offset: number) =>
        Array.from({ length: 25 }, (_, i) => ({
          id: offset + i + 1,
          account_id: 1,
          folder: 'inbox',
          from: 'a@test.com',
          to: 'b@test.com',
          subject: `Sujet ${offset + i + 1}`,
          created_at: new Date().toISOString(),
          is_read: true,
        }))
      vi.mocked(api.fetchMailMessages).mockImplementation(async (_t, _a, _f, opts: { offset?: number }) => {
        const offset = opts?.offset ?? 0
        return { messages: msgs(offset), total: 30 } as any
      })

      render(wrap(<MailPage />))

      await screen.findByText(/Page 1 \/ 2/, {}, { timeout: 10_000 })
      const next = screen.getByRole('button', { name: 'Page suivante' })
      fireEvent.click(next)

      await waitFor(
        () => {
          expect(screen.getByText(/Page 2 \/ 2/)).toBeTruthy()
        },
        { timeout: 10_000 }
      )
      expect(api.fetchMailMessages).toHaveBeenCalledWith(
        'token',
        1,
        'inbox',
        expect.objectContaining({ offset: 25, limit: 25 })
      )
    },
    15_000
  )

  it('filtre la liste avec les opérateurs from: et subject:', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 71,
          account_id: 1,
          folder: 'inbox',
          from: 'Alice Example <alice@test.com>',
          to: 'user@test.com',
          subject: 'Facture avril 2026',
          created_at: new Date().toISOString(),
          is_read: false,
        },
        {
          id: 72,
          account_id: 1,
          folder: 'inbox',
          from: 'Bob <bob@test.com>',
          to: 'user@test.com',
          subject: 'Réunion équipe',
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      total: 2,
    } as any)

    render(wrap(<MailPage />))
    await screen.findByText('Facture avril 2026')
    await screen.findByText('Réunion équipe')

    const input = screen.getByPlaceholderText(/opérateurs: from:/i)
    fireEvent.change(input, { target: { value: 'from:alice subject:facture' } })

    await screen.findByText('Facture avril 2026')
    expect(screen.queryByText('Réunion équipe')).toBeNull()
  })

  it('filtre la liste avec has:attachment et is:unread', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      { id: 1, user_id: 1, tenant_id: 1, email: 'user@test.com' },
    ])
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [
        {
          id: 81,
          account_id: 1,
          folder: 'inbox',
          from: 'sender@test.com',
          to: 'user@test.com',
          subject: 'PJ + non lu',
          created_at: new Date().toISOString(),
          is_read: false,
          attachment_count: 1,
        },
        {
          id: 82,
          account_id: 1,
          folder: 'inbox',
          from: 'sender@test.com',
          to: 'user@test.com',
          subject: 'Sans PJ',
          created_at: new Date().toISOString(),
          is_read: false,
          attachment_count: 0,
        },
        {
          id: 83,
          account_id: 1,
          folder: 'inbox',
          from: 'sender@test.com',
          to: 'user@test.com',
          subject: 'PJ mais lu',
          created_at: new Date().toISOString(),
          is_read: true,
          attachment_count: 1,
        },
      ],
      total: 3,
    } as any)

    render(wrap(<MailPage />))
    await screen.findByText('PJ + non lu')
    const input = screen.getByPlaceholderText(/opérateurs: from:/i)
    fireEvent.change(input, { target: { value: 'has:attachment is:unread' } })

    await screen.findByText('PJ + non lu')
    expect(screen.queryByText('Sans PJ')).toBeNull()
    expect(screen.queryByText('PJ mais lu')).toBeNull()
  })
})
