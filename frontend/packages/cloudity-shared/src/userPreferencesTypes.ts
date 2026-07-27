/** Identifiants apps Cloudity (web + mobile + extension). Source unique `@cloudity/shared`. */
export type CloudityAppId =
  | 'hub'
  | 'pass'
  | 'drive'
  | 'photos'
  | 'mail'
  | 'calendar'
  | 'contacts'
  | 'notes'
  | 'tasks'

export type ThemeMode = 'system' | 'light' | 'dark'

export type ThemePreferences = {
  default: ThemeMode
  apps: Partial<Record<CloudityAppId, ThemeMode>>
}

export type PassPreferences = {
  clipboardEnabled: boolean
  clipboardClearMs: number
  totpAutoCopy: boolean
  digitalAssetLinksEnabled: boolean
  autoLockMs: number
}

export type UserPreferencesV1 = {
  theme: ThemePreferences
  pass: PassPreferences
}

export const DEFAULT_USER_PREFERENCES: UserPreferencesV1 = {
  theme: {
    default: 'system',
    apps: {},
  },
  pass: {
    clipboardEnabled: true,
    clipboardClearMs: 30_000,
    totpAutoCopy: false,
    digitalAssetLinksEnabled: true,
    autoLockMs: 5 * 60_000,
  },
}

export const CLOUDITY_APP_IDS: readonly CloudityAppId[] = [
  'hub',
  'pass',
  'drive',
  'photos',
  'mail',
  'calendar',
  'contacts',
  'notes',
  'tasks',
] as const

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: 'Système',
  light: 'Clair',
  dark: 'Sombre',
}

export const APP_LABELS: Record<CloudityAppId, string> = {
  hub: 'Hub',
  pass: 'Pass',
  drive: 'Drive',
  photos: 'Photos',
  mail: 'Mail',
  calendar: 'Calendrier',
  contacts: 'Contacts',
  notes: 'Notes',
  tasks: 'Tâches',
}

export const USER_PREFERENCES_CACHE_KEY = 'cloudity.userPreferences.v1'
