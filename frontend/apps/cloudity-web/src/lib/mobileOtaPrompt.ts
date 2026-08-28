/**
 * Prompt d’installation APK Android depuis le web (visiteur non connecté).
 * Manifeste public : GET /deploy/mobile/manifest?app=cloudity_* (proxy nginx → gateway).
 */

export type MobileOtaAppMeta = {
  hubId: string
  slug: string
  label: string
  webPathPrefix: string
}

export const MOBILE_OTA_CATALOG: MobileOtaAppMeta[] = [
  { hubId: 'mail', slug: 'cloudity_mail', label: 'Mail', webPathPrefix: '/app/mail' },
  { hubId: 'drive', slug: 'cloudity_drive', label: 'Drive', webPathPrefix: '/app/drive' },
  { hubId: 'photos', slug: 'cloudity_photos', label: 'Photos', webPathPrefix: '/app/photos' },
  { hubId: 'pass', slug: 'cloudity_pass', label: 'Pass', webPathPrefix: '/app/pass' },
  { hubId: 'calendar', slug: 'cloudity_calendar', label: 'Agenda', webPathPrefix: '/app/calendar' },
  { hubId: 'contacts', slug: 'cloudity_contacts', label: 'Contacts', webPathPrefix: '/app/contacts' },
  { hubId: 'notes', slug: 'cloudity_notes', label: 'Notes', webPathPrefix: '/app/notes' },
  { hubId: 'tasks', slug: 'cloudity_tasks', label: 'Tâches', webPathPrefix: '/app/tasks' },
]

export type MobileOtaManifest = {
  app: string
  version: string
  apk_url: string
  min_supported?: string
  sha256?: string
  published_at?: string
  held?: boolean
}

const DISMISS_PREFIX = 'cloudity-mobile-prompt-dismiss:'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Android phone/tablet — APK sideload cible Android uniquement. */
export function isAndroidMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/** Déjà en mode standalone (PWA installée) — pas de prompt APK. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function mobileOtaAppFromPath(pathname: string): MobileOtaAppMeta | null {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/'
  for (const app of MOBILE_OTA_CATALOG) {
    const prefix = app.webPathPrefix.replace(/\/+$/, '')
    if (path === prefix || path.startsWith(`${prefix}/`)) return app
  }
  if (path.startsWith('/4dm1n')) {
    return { hubId: 'admin', slug: 'cloudity_admin', label: 'Admin', webPathPrefix: '/4dm1n' }
  }
  return null
}

export function mobileOtaDismissKey(slug: string): string {
  return `${DISMISS_PREFIX}${slug}`
}

export function isMobileOtaPromptDismissed(slug: string): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(mobileOtaDismissKey(slug))
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) {
      localStorage.removeItem(mobileOtaDismissKey(slug))
      return false
    }
    if (Date.now() - ts > DISMISS_TTL_MS) {
      localStorage.removeItem(mobileOtaDismissKey(slug))
      return false
    }
    return true
  } catch {
    return false
  }
}

export function dismissMobileOtaPrompt(slug: string): void {
  try {
    localStorage.setItem(mobileOtaDismissKey(slug), String(Date.now()))
  } catch {
    /* quota / private mode */
  }
}

export async function fetchPublicMobileOtaManifest(
  appSlug: string,
  signal?: AbortSignal
): Promise<MobileOtaManifest | null> {
  const q = new URLSearchParams({ app: appSlug })
  const res = await fetch(`/deploy/mobile/manifest?${q}`, { signal, credentials: 'omit' })
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = (await res.json()) as MobileOtaManifest
  if (data.held || !data.apk_url?.trim()) return null
  return data
}

export function resolveMobileOtaTarget(returnPath: string | null | undefined): MobileOtaAppMeta | null {
  if (!returnPath?.trim()) return null
  try {
    const url = returnPath.startsWith('http')
      ? new URL(returnPath)
      : new URL(returnPath, 'https://cloudity.local')
    return mobileOtaAppFromPath(url.pathname)
  } catch {
    return mobileOtaAppFromPath(returnPath)
  }
}
