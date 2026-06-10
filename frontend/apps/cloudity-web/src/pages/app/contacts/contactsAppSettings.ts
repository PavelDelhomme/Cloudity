export type ContactsImportDuplicateMode = 'skip' | 'update'

export type ContactsAppSettings = {
  sortAlphabetically: boolean
  showPhoneInList: boolean
  confirmDelete: boolean
  defaultImportDuplicateMode: ContactsImportDuplicateMode
}

const STORAGE_KEY = 'cloudity.contacts.appSettings.v1'

export const DEFAULT_CONTACTS_APP_SETTINGS: ContactsAppSettings = {
  sortAlphabetically: true,
  showPhoneInList: false,
  confirmDelete: true,
  defaultImportDuplicateMode: 'skip',
}

export function loadContactsAppSettings(): ContactsAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONTACTS_APP_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ContactsAppSettings>
    return {
      sortAlphabetically:
        typeof parsed.sortAlphabetically === 'boolean'
          ? parsed.sortAlphabetically
          : DEFAULT_CONTACTS_APP_SETTINGS.sortAlphabetically,
      showPhoneInList:
        typeof parsed.showPhoneInList === 'boolean'
          ? parsed.showPhoneInList
          : DEFAULT_CONTACTS_APP_SETTINGS.showPhoneInList,
      confirmDelete:
        typeof parsed.confirmDelete === 'boolean'
          ? parsed.confirmDelete
          : DEFAULT_CONTACTS_APP_SETTINGS.confirmDelete,
      defaultImportDuplicateMode:
        parsed.defaultImportDuplicateMode === 'update' ? 'update' : 'skip',
    }
  } catch {
    return { ...DEFAULT_CONTACTS_APP_SETTINGS }
  }
}

export function saveContactsAppSettings(settings: ContactsAppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
