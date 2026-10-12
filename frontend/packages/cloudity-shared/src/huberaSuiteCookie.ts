import { AUTH_STORAGE_KEY } from './cloudityCore'

export const HUBERA_SUITE_COOKIE = 'hubera_suite_auth'

export type HuberaSuiteAuthState = {
  accessToken: string | null
  refreshToken: string | null
  tenantId: number | null
  email: string | null
}

export function onHuberaCloudHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === 'hubera.cloud' || h.endsWith('.hubera.cloud')
}

export function parseHuberaSuiteAuth(raw: string | null): HuberaSuiteAuthState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<HuberaSuiteAuthState> & { tenantId?: number }
    if (data.accessToken && data.tenantId != null) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        tenantId: data.tenantId,
        email: data.email ?? null,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function readHuberaSuiteCookie(): HuberaSuiteAuthState | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k !== HUBERA_SUITE_COOKIE) continue
    try {
      return parseHuberaSuiteAuth(decodeURIComponent(rest.join('=')))
    } catch {
      return null
    }
  }
  return null
}

export function writeHuberaSuiteCookie(state: HuberaSuiteAuthState): void {
  if (typeof document === 'undefined' || !onHuberaCloudHost()) return
  if (state.accessToken && state.tenantId != null) {
    const payload = encodeURIComponent(JSON.stringify(state))
    if (payload.length > 3500) return
    document.cookie = `${HUBERA_SUITE_COOKIE}=${payload}; Domain=.hubera.cloud; Path=/; Secure; SameSite=Lax; Max-Age=1209600`
  } else {
    document.cookie = `${HUBERA_SUITE_COOKIE}=; Domain=.hubera.cloud; Path=/; Secure; SameSite=Lax; Max-Age=0`
  }
}

export { AUTH_STORAGE_KEY }
