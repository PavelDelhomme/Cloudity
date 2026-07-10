import {
  DEFAULT_USER_PREFERENCES,
  USER_PREFERENCES_CACHE_KEY,
  type PassPreferences,
  type UserPreferencesV1,
} from '@cloudity/shared'

export { DEFAULT_USER_PREFERENCES, USER_PREFERENCES_CACHE_KEY }
export type { PassPreferences, UserPreferencesV1 }

export function normalizeUserPreferences(
  raw: Record<string, unknown> | null | undefined,
): UserPreferencesV1 {
  if (!raw) return structuredClone(DEFAULT_USER_PREFERENCES)
  const themeRaw = raw.theme
  const apps: Record<string, 'system' | 'light' | 'dark'> = {}
  let def: 'system' | 'light' | 'dark' = 'system'
  if (themeRaw && typeof themeRaw === 'object') {
    const t = themeRaw as Record<string, unknown>
    if (t.default === 'light' || t.default === 'dark' || t.default === 'system') {
      def = t.default
    }
    if (t.apps && typeof t.apps === 'object') {
      for (const [k, v] of Object.entries(t.apps as Record<string, unknown>)) {
        if (v === 'light' || v === 'dark' || v === 'system') apps[k] = v
      }
    }
  }
  const passRaw = raw.pass
  const pass = parsePass(passRaw)
  return { theme: { default: def, apps }, pass }
}

function parsePass(raw: unknown): PassPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES.pass }
  const o = raw as Record<string, unknown>
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    clipboardEnabled:
      typeof o.clipboardEnabled === 'boolean'
        ? o.clipboardEnabled
        : DEFAULT_USER_PREFERENCES.pass.clipboardEnabled,
    clipboardClearMs: n(o.clipboardClearMs, DEFAULT_USER_PREFERENCES.pass.clipboardClearMs),
    totpAutoCopy:
      typeof o.totpAutoCopy === 'boolean' ? o.totpAutoCopy : DEFAULT_USER_PREFERENCES.pass.totpAutoCopy,
    digitalAssetLinksEnabled:
      typeof o.digitalAssetLinksEnabled === 'boolean'
        ? o.digitalAssetLinksEnabled
        : DEFAULT_USER_PREFERENCES.pass.digitalAssetLinksEnabled,
    autoLockMs: n(o.autoLockMs, DEFAULT_USER_PREFERENCES.pass.autoLockMs),
  }
}

export async function loadCachedUserPreferences(): Promise<UserPreferencesV1> {
  const stored = await chrome.storage.local.get([USER_PREFERENCES_CACHE_KEY])
  const raw = stored[USER_PREFERENCES_CACHE_KEY]
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_USER_PREFERENCES)
  return normalizeUserPreferences(raw as Record<string, unknown>)
}

export async function saveCachedUserPreferences(prefs: UserPreferencesV1): Promise<void> {
  await chrome.storage.local.set({ [USER_PREFERENCES_CACHE_KEY]: prefs })
}

export async function fetchUserPreferences(
  gateway: string,
  accessToken: string,
): Promise<UserPreferencesV1> {
  const res = await fetch(`${gateway.replace(/\/$/, '')}/auth/me/preferences`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`GET preferences → ${res.status}`)
  const body = (await res.json()) as { preferences?: Record<string, unknown> }
  return normalizeUserPreferences(body.preferences)
}

export async function syncUserPreferencesFromSession(
  gateway: string,
  accessToken: string,
): Promise<UserPreferencesV1> {
  const prefs = await fetchUserPreferences(gateway, accessToken)
  await saveCachedUserPreferences(prefs)
  return prefs
}

export async function updatePassPreferences(
  gateway: string,
  accessToken: string,
  patch: Partial<PassPreferences>,
): Promise<UserPreferencesV1> {
  const current = await loadCachedUserPreferences()
  const nextPass = { ...current.pass, ...patch }
  const res = await fetch(`${gateway.replace(/\/$/, '')}/auth/me/preferences`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preferences: { pass: nextPass } }),
  })
  if (!res.ok) throw new Error(`PUT preferences → ${res.status}`)
  const body = (await res.json()) as { preferences?: Record<string, unknown> }
  const merged = normalizeUserPreferences(body.preferences)
  await saveCachedUserPreferences(merged)
  return merged
}
