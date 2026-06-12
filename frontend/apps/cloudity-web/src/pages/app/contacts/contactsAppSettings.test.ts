import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTACTS_APP_SETTINGS,
  loadContactsAppSettings,
  saveContactsAppSettings,
} from './contactsAppSettings'

describe('contactsAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut', () => {
    expect(loadContactsAppSettings()).toEqual(DEFAULT_CONTACTS_APP_SETTINGS)
  })

  it('persiste et recharge les paramètres', () => {
    saveContactsAppSettings({
      sortAlphabetically: false,
      showPhoneInList: true,
      confirmDelete: false,
      defaultImportDuplicateMode: 'update',
      lockEnabled: true,
    })
    expect(loadContactsAppSettings()).toEqual({
      sortAlphabetically: false,
      showPhoneInList: true,
      confirmDelete: false,
      defaultImportDuplicateMode: 'update',
      lockEnabled: true,
    })
  })
})
