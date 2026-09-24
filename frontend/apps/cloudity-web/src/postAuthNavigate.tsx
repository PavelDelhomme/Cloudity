import { useLayoutEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { ADMIN_UI_BASE_PATH } from '@cloudity/shared'

/** Le shell utilisateur (`App.tsx`) ne monte pas les routes `/4dm1n*` : elles sont servies par `admin.html` (Vite / nginx). */
export function isAdminUiSpaPath(path: string): boolean {
  const pathOnly = path.split(/[?#]/)[0] ?? path
  return pathOnly === ADMIN_UI_BASE_PATH || pathOnly.startsWith(`${ADMIN_UI_BASE_PATH}/`)
}

const HOST_APP_HOME: Record<string, string> = {
  mail: '/app/mail/',
  drive: '/app/drive/',
  pass: '/app/pass',
  calendar: '/app/calendar',
  notes: '/app/notes',
  tasks: '/app/tasks',
  contacts: '/app/contacts',
  photos: '/app/photos',
  office: '/app/office',
}

/** Sur mail.hubera.cloud (etc.) on ouvre l’app, pas le tableau de bord `/app`. */
export function appHomeForHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): string {
  const sub = hostname.split('.')[0] || ''
  return HOST_APP_HOME[sub] || '/app'
}

/** Après login / session : navigation client pour `/app`, rechargement complet pour le back-office. */
export function navigateAfterAuth(navigate: NavigateFunction, path: string, replace = true): void {
  if (isAdminUiSpaPath(path)) {
    window.location.assign(path)
    return
  }
  navigate(path, { replace })
}

/** Composant : redirection pleine page vers le bundle admin (évite `Navigate` dans le mauvais Router). */
export function FullPageRedirect({ href }: { href: string }) {
  useLayoutEffect(() => {
    window.location.replace(href)
  }, [href])
  return (
    <div className="p-6 text-sm text-slate-600 dark:text-slate-400">
      Redirection vers l’administration…
    </div>
  )
}

