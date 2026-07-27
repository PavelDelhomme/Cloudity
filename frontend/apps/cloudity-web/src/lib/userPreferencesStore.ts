import {
  DEFAULT_USER_PREFERENCES,
  USER_PREFERENCES_CACHE_KEY,
  type CloudityAppId,
  type PassPreferences,
  type ThemeMode,
  type ThemePreferences,
  type UserPreferencesV1,
} from './userPreferencesTypes'

export type UserPreferencesResponse = {
  preferences: Record<string, unknown>
  updated_at?: string
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark'
}

function parseThemePrefs(raw: unknown): ThemePreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES.theme }
  const o = raw as Record<string, unknown>
  const apps: Partial<Record<CloudityAppId, ThemeMode>> = {}
  if (o.apps && typeof o.apps === 'object') {
    for (const [k, v] of Object.entries(o.apps as Record<string, unknown>)) {
      if (isThemeMode(v)) apps[k as CloudityAppId] = v
    }
  }
  return {
    default: isThemeMode(o.default) ? o.default : DEFAULT_USER_PREFERENCES.theme.default,
    apps,
  }
}

function parsePassPrefs(raw: unknown): PassPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES.pass }
  const o = raw as Record<string, unknown>
  const n = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
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

export function normalizeUserPreferences(raw: Record<string, unknown> | null | undefined): UserPreferencesV1 {
  if (!raw) return structuredClone(DEFAULT_USER_PREFERENCES)
  return {
    theme: parseThemePrefs(raw.theme),
    pass: parsePassPrefs(raw.pass),
  }
}

export function loadCachedUserPreferences(): UserPreferencesV1 {
  try {
    const raw = localStorage.getItem(USER_PREFERENCES_CACHE_KEY)
    if (!raw) return structuredClone(DEFAULT_USER_PREFERENCES)
    return normalizeUserPreferences(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return structuredClone(DEFAULT_USER_PREFERENCES)
  }
}

export function saveCachedUserPreferences(prefs: UserPreferencesV1): void {
  try {
    localStorage.setItem(USER_PREFERENCES_CACHE_KEY, JSON.stringify(prefs))
  } catch {
    /* quota */
  }
}

export function resolveThemeForApp(prefs: UserPreferencesV1, appId: CloudityAppId): ThemeMode {
  return prefs.theme.apps[appId] ?? prefs.theme.default
}

export function toPreferencesPatch(prefs: UserPreferencesV1): Record<string, unknown> {
  return JSON.parse(JSON.stringify(prefs)) as Record<string, unknown>
}

/** Applique les préférences Pass legacy localStorage (migration douce). */
export function migrateLegacyPassPrefs(prefs: UserPreferencesV1): UserPreferencesV1 {
  try {
    const raw = localStorage.getItem('cloudity.pass.autoLockMs.v1')
    if (raw == null) return prefs
    const ms = Number.parseInt(raw, 10)
    if (!Number.isFinite(ms)) return prefs
    return {
      ...prefs,
      pass: { ...prefs.pass, autoLockMs: ms },
    }
  } catch {
    return prefs
  }
}

export { USER_PREFERENCES_CACHE_KEY as LOCAL_CACHE_KEY }
