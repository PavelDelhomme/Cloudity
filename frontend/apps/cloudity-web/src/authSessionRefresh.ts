import { AUTH_STORAGE_KEY, isAccessTokenUsable } from '@cloudity/shared'
import { refreshAuth } from './api'
import type { AuthState } from './authContextStore'

const REFRESH_LOCK = 'cloudity-auth-refresh'

const defaultState: AuthState = {
  accessToken: null,
  refreshToken: null,
  tenantId: null,
  email: null,
}

function readStorage(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return defaultState
    const data = JSON.parse(raw) as AuthState
    if (data.accessToken && data.tenantId != null) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        tenantId: data.tenantId,
        email: data.email ?? null,
      }
    }
  } catch {
    // ignore
  }
  return defaultState
}

function writeStorage(next: AuthState): void {
  if (next.accessToken && next.tenantId != null) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

let inFlight: Promise<AuthState | null> | null = null

async function runRefresh(options?: { force?: boolean }): Promise<AuthState | null> {
  const execute = async (): Promise<AuthState | null> => {
    const stored = readStorage()
    if (!stored.refreshToken || !stored.accessToken || stored.tenantId == null) return null
    if (!options?.force && isAccessTokenUsable(stored.accessToken)) return stored

    try {
      const res = await refreshAuth(stored.refreshToken)
      const next: AuthState = {
        ...stored,
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
      }
      writeStorage(next)
      return next
    } catch {
      return null
    }
  }

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK, execute)
  }
  return execute()
}

/**
 * Rafraîchit la session via POST /auth/refresh avec :
 * - déduplication des appels parallèles (même bundle),
 * - verrou Web Locks cross-onglets / cross-bundles (index.html + admin.html),
 * - relecture du localStorage après attente du verrou (rotation côté serveur).
 */
export async function refreshSessionExclusive(options?: { force?: boolean }): Promise<AuthState | null> {
  if (inFlight) return inFlight
  inFlight = runRefresh(options).finally(() => {
    inFlight = null
  })
  return inFlight
}
