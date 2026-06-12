export type NotesSortOrder = 'newest' | 'oldest'

export type NotesAppSettings = {
  sortOrder: NotesSortOrder
  showContentPreview: boolean
  lockEnabled: boolean
}

const STORAGE_KEY = 'cloudity.notes.appSettings.v1'

export const DEFAULT_NOTES_APP_SETTINGS: NotesAppSettings = {
  sortOrder: 'newest',
  showContentPreview: true,
  lockEnabled: false,
}

export function loadNotesAppSettings(): NotesAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NOTES_APP_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<NotesAppSettings>
    return {
      sortOrder: parsed.sortOrder === 'oldest' ? 'oldest' : 'newest',
      showContentPreview:
        typeof parsed.showContentPreview === 'boolean'
          ? parsed.showContentPreview
          : DEFAULT_NOTES_APP_SETTINGS.showContentPreview,
      lockEnabled:
        typeof parsed.lockEnabled === 'boolean'
          ? parsed.lockEnabled
          : DEFAULT_NOTES_APP_SETTINGS.lockEnabled,
    }
  } catch {
    return { ...DEFAULT_NOTES_APP_SETTINGS }
  }
}

export function saveNotesAppSettings(settings: NotesAppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
