import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildMailDeepLink,
  parseMailDeepLink,
  resolveLatestInboxMessageId,
  resolveMailNotificationTarget,
} from './mailNotificationDeepLink'
import * as api from '../api'

vi.mock('../api', () => ({
  fetchMailMessages: vi.fn(),
}))

describe('mailNotificationDeepLink', () => {
  beforeEach(() => {
    vi.mocked(api.fetchMailMessages).mockReset()
  })

  it('buildMailDeepLink encode account et message', () => {
    expect(buildMailDeepLink({ accountId: 3, messageId: 42 })).toBe('/app/mail?account=3&message=42')
    expect(buildMailDeepLink({ accountId: 1, folder: 'inbox' })).toBe('/app/mail?account=1&folder=inbox')
  })

  it('parseMailDeepLink lit les paramètres', () => {
    const params = new URLSearchParams('account=2&message=9&folder=inbox')
    expect(parseMailDeepLink(params)).toEqual({ accountId: 2, messageId: 9, folder: 'inbox' })
    expect(parseMailDeepLink(new URLSearchParams('account=0'))).toBeNull()
    expect(parseMailDeepLink(new URLSearchParams(''))).toBeNull()
  })

  it('resolveLatestInboxMessageId retourne le premier message', async () => {
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [{ id: 77, account_id: 1 } as any],
      total: 1,
    })
    await expect(resolveLatestInboxMessageId('tk', 1)).resolves.toBe(77)
    expect(api.fetchMailMessages).toHaveBeenCalledWith('tk', 1, 'inbox', { limit: 1, offset: 0 })
  })

  it('resolveMailNotificationTarget inclut messageId si sync > 0', async () => {
    vi.mocked(api.fetchMailMessages).mockResolvedValue({
      messages: [{ id: 5, account_id: 2 } as any],
      total: 1,
    })
    await expect(resolveMailNotificationTarget('tk', 2, 1)).resolves.toEqual({
      accountId: 2,
      messageId: 5,
      folder: 'inbox',
    })
    await expect(resolveMailNotificationTarget('tk', 2, 0)).resolves.toEqual({ accountId: 2 })
  })
})
