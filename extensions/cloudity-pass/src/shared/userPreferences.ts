/**
 * Préférences utilisateur — types et défauts depuis `@cloudity/shared`.
 * Persistance extension : `chrome.storage.local`.
 */
export {
  DEFAULT_USER_PREFERENCES,
  USER_PREFERENCES_CACHE_KEY,
  normalizeUserPreferences,
  loadCachedUserPreferences,
  saveCachedUserPreferences,
  fetchUserPreferences,
  syncUserPreferencesFromSession,
  updatePassPreferences,
} from './userPreferencesStore'

export type { PassPreferences, UserPreferencesV1 } from '@cloudity/shared'
