import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../authContext'
import { fetchUserPreferences, updateUserPreferences } from '../api'
import {
  loadCachedUserPreferences,
  migrateLegacyPassPrefs,
  normalizeUserPreferences,
  resolveThemeForApp,
  saveCachedUserPreferences,
  toPreferencesPatch,
} from '../lib/userPreferencesStore'
import type { CloudityAppId, ThemeMode, UserPreferencesV1 } from '../lib/userPreferencesTypes'
import { applyDocumentTheme, watchSystemTheme } from './applyTheme'

type ThemeContextValue = {
  prefs: UserPreferencesV1
  appId: CloudityAppId
  effectiveTheme: ThemeMode
  setAppTheme: (appId: CloudityAppId, mode: ThemeMode) => Promise<void>
  setDefaultTheme: (mode: ThemeMode) => Promise<void>
  updatePassPrefs: (patch: Partial<UserPreferencesV1['pass']>) => Promise<void>
  refreshPreferences: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

type Props = {
  children: ReactNode
  /** App courante pour résoudre le thème (route /app/pass → pass). */
  appId?: CloudityAppId
}

export function ThemeProvider({ children, appId = 'hub' }: Props) {
  const { accessToken, isAuthenticated, sessionReady } = useAuth()
  const [prefs, setPrefs] = useState<UserPreferencesV1>(() =>
    migrateLegacyPassPrefs(loadCachedUserPreferences())
  )

  const effectiveTheme = useMemo(() => resolveThemeForApp(prefs, appId), [prefs, appId])

  useEffect(() => {
    applyDocumentTheme(effectiveTheme)
    if (effectiveTheme !== 'system') return
    return watchSystemTheme(() => applyDocumentTheme('system'))
  }, [effectiveTheme])

  const persist = useCallback(
    async (next: UserPreferencesV1) => {
      setPrefs(next)
      saveCachedUserPreferences(next)
      if (!accessToken) return
      try {
        await updateUserPreferences(accessToken, toPreferencesPatch(next))
      } catch {
        /* offline — cache local suffit */
      }
    },
    [accessToken]
  )

  const refreshPreferences = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetchUserPreferences(accessToken)
      const next = migrateLegacyPassPrefs(normalizeUserPreferences(res.preferences))
      setPrefs(next)
      saveCachedUserPreferences(next)
    } catch {
      /* garde cache */
    }
  }, [accessToken])

  useEffect(() => {
    if (sessionReady && isAuthenticated && accessToken) void refreshPreferences()
  }, [sessionReady, isAuthenticated, accessToken, refreshPreferences])

  const setAppTheme = useCallback(
    async (targetApp: CloudityAppId, mode: ThemeMode) => {
      const next: UserPreferencesV1 = {
        ...prefs,
        theme: {
          ...prefs.theme,
          apps: { ...prefs.theme.apps, [targetApp]: mode },
        },
      }
      await persist(next)
    },
    [prefs, persist]
  )

  const setDefaultTheme = useCallback(
    async (mode: ThemeMode) => {
      const next: UserPreferencesV1 = {
        ...prefs,
        theme: { ...prefs.theme, default: mode },
      }
      await persist(next)
    },
    [prefs, persist]
  )

  const updatePassPrefs = useCallback(
    async (patch: Partial<UserPreferencesV1['pass']>) => {
      const next: UserPreferencesV1 = {
        ...prefs,
        pass: { ...prefs.pass, ...patch },
      }
      if (patch.autoLockMs != null) {
        try {
          localStorage.setItem('cloudity.pass.autoLockMs.v1', String(patch.autoLockMs))
        } catch {
          /* ignore */
        }
      }
      await persist(next)
    },
    [prefs, persist]
  )

  const value = useMemo(
    () => ({
      prefs,
      appId,
      effectiveTheme,
      setAppTheme,
      setDefaultTheme,
      updatePassPrefs,
      refreshPreferences,
    }),
    [prefs, appId, effectiveTheme, setAppTheme, setDefaultTheme, updatePassPrefs, refreshPreferences]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemePreferences(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemePreferences requires ThemeProvider')
  return ctx
}

/** Détecte l'app Cloudity depuis le pathname (/app/pass → pass). */
export function cloudityAppIdFromPath(pathname: string): CloudityAppId {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] !== 'app') return 'hub'
  const app = seg[1] as CloudityAppId | undefined
  const known: CloudityAppId[] = [
    'pass',
    'drive',
    'photos',
    'mail',
    'calendar',
    'contacts',
    'notes',
    'tasks',
  ]
  return app && known.includes(app) ? app : 'hub'
}
