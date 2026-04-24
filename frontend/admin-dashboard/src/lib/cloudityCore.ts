/**
 * Constantes et URL API — premier pas A2/A3 (STATUS §0b).
 * Reste dans admin-dashboard jusqu’au contexte Docker **`frontend/`** unifié (A8), puis extraction vers **`packages/*`**.
 */
export const AUTH_STORAGE_KEY = 'cloudity_admin_auth'

export function getApiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
  let base = env?.VITE_API_URL ?? ''
  base = base ? `${base.replace(/\/$/, '')}` : ''
  return base
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl()
  const pathNorm = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${pathNorm}` : pathNorm
}
