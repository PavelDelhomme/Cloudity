export const MAIL_DESKTOP_NOTIFICATIONS_KEY = 'cloudity_mail_desktop_notifications'

export type MailDesktopNotificationStatus =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'

export function getMailDesktopNotificationStatus(): MailDesktopNotificationStatus {
  if (typeof globalThis.Notification === 'undefined') return 'unsupported'
  return globalThis.Notification.permission
}

export function isMailDesktopNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (getMailDesktopNotificationStatus() !== 'granted') return false
  return window.localStorage.getItem(MAIL_DESKTOP_NOTIFICATIONS_KEY) === '1'
}

export function setMailDesktopNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MAIL_DESKTOP_NOTIFICATIONS_KEY, enabled ? '1' : '0')
}

export async function requestMailDesktopNotifications(): Promise<MailDesktopNotificationStatus> {
  if (typeof globalThis.Notification === 'undefined') return 'unsupported'
  const permission = await globalThis.Notification.requestPermission()
  setMailDesktopNotificationsEnabled(permission === 'granted')
  return permission
}

let mailNotificationClickHandler: ((href: string) => void) | null = null

/** Enregistre le handler de navigation (AppLayout) pour les clics sur notifications bureau. */
export function registerMailNotificationClickHandler(handler: ((href: string) => void) | null): void {
  mailNotificationClickHandler = handler
}

export function showMailDesktopNotification(
  title: string,
  options?: NotificationOptions & { data?: { href?: string } },
  opts?: { requireHidden?: boolean }
): boolean {
  if (!isMailDesktopNotificationsEnabled()) return false
  if (opts?.requireHidden && typeof document !== 'undefined' && document.visibilityState !== 'hidden') return false
  try {
    const href = options?.data?.href
    const notification = new globalThis.Notification(title, options)
    if (href && mailNotificationClickHandler) {
      notification.onclick = () => {
        window.focus()
        notification.close()
        mailNotificationClickHandler?.(href)
      }
    }
    return true
  } catch {
    return false
  }
}
