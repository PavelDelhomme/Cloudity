import type { MailAccountResponse } from '../api'
import type { useNotifications } from '../notificationsContext'
import { buildMailDeepLink, resolveMailNotificationTarget } from './mailNotificationDeepLink'
import { showMailDesktopNotification } from './mailDesktopNotifications'

type NotificationsCtx = ReturnType<typeof useNotifications>

export type NotifyNewMailOptions = {
  /** Titre in-app (défaut : « Nouveau courrier »). */
  title?: string
  /** Préfixe notification bureau (défaut : « Cloudity — Courrier »). */
  desktopTitle?: string
  /** Ne notifier le bureau que si l’onglet est en arrière-plan. */
  desktopRequireHidden?: boolean
}

/**
 * Ajoute une notification in-app + bureau avec lien profond vers Mail.
 * Si `token` est fourni, tente d’ouvrir le message le plus récent de la boîte.
 */
export async function notifyNewMailMessages(
  ctx: NotificationsCtx,
  account: MailAccountResponse,
  synced: number,
  token?: string,
  opts?: NotifyNewMailOptions
): Promise<void> {
  if (!ctx || synced <= 0) return
  const name = (account.label?.trim() || account.email || `Boîte #${account.id}`).trim()
  let href = buildMailDeepLink({ accountId: account.id, folder: 'inbox' })
  if (token) {
    const target = await resolveMailNotificationTarget(token, account.id, synced)
    href = buildMailDeepLink(target)
  }
  ctx.addNotification({
    type: 'info',
    title: opts?.title ?? 'Nouveau courrier',
    message: synced === 1 ? `${name} — 1 nouveau message` : `${name} — ${synced} nouveaux messages`,
    href,
  })
  showMailDesktopNotification(
    opts?.desktopTitle ?? 'Cloudity — Courrier',
    {
      body: synced === 1 ? `${name} : 1 nouveau message` : `${name} : ${synced} nouveaux messages`,
      tag: `cloudity-mail-${account.id}`,
      data: { href },
    },
    { requireHidden: opts?.desktopRequireHidden ?? false }
  )
}
