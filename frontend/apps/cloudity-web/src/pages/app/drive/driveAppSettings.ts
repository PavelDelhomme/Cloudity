export type DriveDisplayMode = 'grid' | 'list'

export type DriveAppSettings = {
  displayMode: DriveDisplayMode
  showRecentSection: boolean
}

const STORAGE_KEY = 'cloudity.drive.appSettings.v1'
const LEGACY_DISPLAY_KEY = 'cloudity_drive_display'
const LEGACY_RECENT_VISIBLE_KEY = 'cloudity_drive_recent_visible'

export const DEFAULT_DRIVE_APP_SETTINGS: DriveAppSettings = {
  displayMode: 'grid',
  showRecentSection: true,
}

export function loadDriveAppSettings(): DriveAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DriveAppSettings>
      return {
        displayMode: parsed.displayMode === 'list' ? 'list' : 'grid',
        showRecentSection:
          typeof parsed.showRecentSection === 'boolean'
            ? parsed.showRecentSection
            : DEFAULT_DRIVE_APP_SETTINGS.showRecentSection,
      }
    }
  } catch {
    /* ignore */
  }
  try {
    return {
      displayMode: localStorage.getItem(LEGACY_DISPLAY_KEY) === 'list' ? 'list' : 'grid',
      showRecentSection: localStorage.getItem(LEGACY_RECENT_VISIBLE_KEY) !== 'false',
    }
  } catch {
    return { ...DEFAULT_DRIVE_APP_SETTINGS }
  }
}

export function saveDriveAppSettings(settings: DriveAppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    localStorage.setItem(LEGACY_DISPLAY_KEY, settings.displayMode)
    localStorage.setItem(LEGACY_RECENT_VISIBLE_KEY, String(settings.showRecentSection))
  } catch {
    /* ignore */
  }
}
