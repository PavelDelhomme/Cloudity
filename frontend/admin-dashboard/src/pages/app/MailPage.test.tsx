import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
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
})
