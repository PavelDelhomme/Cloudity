/**
 * Chemin du back-office dans la SPA (obscurcissement d’URL).
 * Les appels API passent toujours par le préfixe gateway `/admin/*` (inchangé).
 */
export const ADMIN_UI_BASE_PATH = '/4dm1n' as const

export function adminUiPath(relative = ''): string {
  const r = relative.startsWith('/') ? relative : `/${relative}`
  if (r === '/') return ADMIN_UI_BASE_PATH
  return `${ADMIN_UI_BASE_PATH}${r}`
}

/** Autorise les redirections post-login vers l’ancien chemin (compat signets). */
export function isAdminUiReturnPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/') || path === ADMIN_UI_BASE_PATH || path.startsWith(`${ADMIN_UI_BASE_PATH}/`)
}

/** Normalise les signets encore en `/admin` vers le chemin UI actuel. */
export function normalizePostLoginPath(path: string): string {
  if (path.startsWith('/admin/')) return `${ADMIN_UI_BASE_PATH}${path.slice('/admin'.length)}`
  if (path === '/admin') return ADMIN_UI_BASE_PATH
  return path
}
