export type PhotosGridSize = 'compact' | 'normal' | 'large'

export type PhotosAppSettings = {
  gridSize: PhotosGridSize
  showDateSections: boolean
  confirmArchiveLock: boolean
}

const STORAGE_KEY = 'cloudity.photos.appSettings.v1'

export const DEFAULT_PHOTOS_APP_SETTINGS: PhotosAppSettings = {
  gridSize: 'normal',
  showDateSections: true,
  confirmArchiveLock: true,
}

export function loadPhotosAppSettings(): PhotosAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PHOTOS_APP_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<PhotosAppSettings>
    return {
      gridSize:
        parsed.gridSize === 'compact' || parsed.gridSize === 'large' || parsed.gridSize === 'normal'
          ? parsed.gridSize
          : DEFAULT_PHOTOS_APP_SETTINGS.gridSize,
      showDateSections:
        typeof parsed.showDateSections === 'boolean'
          ? parsed.showDateSections
          : DEFAULT_PHOTOS_APP_SETTINGS.showDateSections,
      confirmArchiveLock:
        typeof parsed.confirmArchiveLock === 'boolean'
          ? parsed.confirmArchiveLock
          : DEFAULT_PHOTOS_APP_SETTINGS.confirmArchiveLock,
    }
  } catch {
    return { ...DEFAULT_PHOTOS_APP_SETTINGS }
  }
}

export function savePhotosAppSettings(settings: PhotosAppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota / private mode */
  }
}

export function photosGridClassName(gridSize: PhotosGridSize): string {
  switch (gridSize) {
    case 'compact':
      return 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9'
    case 'large':
      return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
    default:
      return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'
  }
}
