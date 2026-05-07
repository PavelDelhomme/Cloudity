import { useLayoutEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { ADMIN_UI_BASE_PATH } from '@cloudity/shared'

/** Le shell utilisateur (`App.tsx`) ne monte pas les routes `/4dm1n*` : elles sont servies par `admin.html` (Vite / nginx). */
export function isAdminUiSpaPath(path: string): boolean {
  const pathOnly = path.split(/[?#]/)[0] ?? path
  return pathOnly === ADMIN_UI_BASE_PATH || pathOnly.startsWith(`${ADMIN_UI_BASE_PATH}/`)
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
