import { fetchMailMessages } from '../api'

export type MailDeepLinkTarget = {
  accountId: number
  messageId?: number
  folder?: string
}

export function buildMailDeepLink(target: MailDeepLinkTarget): string {
  const params = new URLSearchParams()
  params.set('account', String(target.accountId))
  if (target.messageId != null && target.messageId > 0) {
    params.set('message', String(target.messageId))
  }
  if (target.folder?.trim()) {
    params.set('folder', target.folder.trim())
  }
  return `/app/mail?${params.toString()}`
}

export function parseMailDeepLink(searchParams: URLSearchParams): MailDeepLinkTarget | null {
  const accountRaw = searchParams.get('account')
  if (!accountRaw) return null
  const accountId = Number(accountRaw)
  if (!Number.isFinite(accountId) || accountId <= 0) return null
  const messageRaw = searchParams.get('message')
  const messageId = messageRaw != null ? Number(messageRaw) : undefined
  const folder = searchParams.get('folder')?.trim() || undefined
  return {
    accountId,
    messageId: messageId != null && Number.isFinite(messageId) && messageId > 0 ? messageId : undefined,
    folder,
  }
}

/** Dernier message de la boîte de réception (pour ouvrir le plus récent après sync). */
export async function resolveLatestInboxMessageId(
  token: string,
  accountId: number
): Promise<number | undefined> {
  try {
    const page = await fetchMailMessages(token, accountId, 'inbox', { limit: 1, offset: 0 })
    const first = page.messages?.[0]
    return first?.id && first.id > 0 ? first.id : undefined
  } catch {
    return undefined
  }
}

export async function resolveMailNotificationTarget(
  token: string,
  accountId: number,
  synced: number
): Promise<MailDeepLinkTarget> {
  if (synced <= 0) return { accountId }
  const messageId = await resolveLatestInboxMessageId(token, accountId)
  return { accountId, messageId, folder: 'inbox' }
}
