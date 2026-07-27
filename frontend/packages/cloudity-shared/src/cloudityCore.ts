/**
 * Constantes et URL API — premier pas A2/A3 (STATUS §0b).
 * Partagé via **`@cloudity/shared`** ; consommé par **`@cloudity/web`** (`api.ts`, auth, etc.).
 */
export const AUTH_STORAGE_KEY = 'cloudity_admin_auth'

export function getApiBaseUrl(): string {
  // Navigateur dev : proxy Vite same-origin (localhost, *.localhost) — évite CORS cloudity.localhost → localhost:6002
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    const isLocalDevHost =
      host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
    if (isLocalDevHost) {
      const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } }
      if (meta.env?.DEV) {
        return ''
      }
    }
    // LAN : API sur le même IP, port gateway (6002 par défaut)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      const gwPort =
        (import.meta as unknown as { env?: { VITE_GATEWAY_PORT?: string } }).env
          ?.VITE_GATEWAY_PORT ?? '6002'
      return `${window.location.protocol}//${host}:${gwPort}`
    }
  }

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
