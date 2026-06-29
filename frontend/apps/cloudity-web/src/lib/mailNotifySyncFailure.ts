import type { MailAccountResponse } from '../api'
import type { useNotifications } from '../notificationsContext'
import { buildMailDeepLink } from './mailNotificationDeepLink'
import { showMailDesktopNotification } from './mailDesktopNotifications'
import {
  isMailSyncAuthFailureError,
  isMailSyncPasswordRequiredError,
  markMailSyncPasswordPrompted,
  shouldPromptMailSyncPassword,
} from '../pages/app/mail/mailSyncHelpers'

type NotificationsCtx = ReturnType<typeof useNotifications>

function accountLabel(account: MailAccountResponse): string {
  return (account.label?.trim() || account.email || `Boîte #${account.id}`).trim()
}

function truncateError(msg: string, max = 140): string {
  const t = msg.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * Notifie l'utilisateur d'un échec de sync IMAP (une fois par boîte et par session).
 * Retourne true si une notification a été émise.
 */
export function notifyMailSyncFailure(
  ctx: NotificationsCtx | null,
  account: MailAccountResponse,
  error: unknown,
  opts?: { desktopRequireHidden?: boolean }
): boolean {
  if (!ctx) return false
  if (!isMailSyncAuthFailureError(error) && !isMailSyncPasswordRequiredError(error)) {
    return false
  }
  if (!shouldPromptMailSyncPassword(account.id)) return false
  markMailSyncPasswordPrompted(account.id)

  const name = accountLabel(account)
  const raw = error instanceof Error ? error.message : String(error)
  const message = truncateError(raw)
  const title = isMailSyncPasswordRequiredError(error)
    ? 'Mail — mot de passe requis'
    : 'Mail — synchronisation impossible'
  const href = buildMailDeepLink({ accountId: account.id, folder: 'inbox' })

  ctx.addNotification({
    type: 'warning',
    title,
    message: `${name} — ${message}`,
    href,
  })
  showMailDesktopNotification(
    'Cloudity — Mail',
    {
      body: `${name} : ${message}`,
      tag: `cloudity-mail-sync-${account.id}`,
      data: { href },
    },
    { requireHidden: opts?.desktopRequireHidden ?? false }
  )
  return true
}
