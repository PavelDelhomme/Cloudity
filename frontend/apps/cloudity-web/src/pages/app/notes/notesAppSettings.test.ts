import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTES_APP_SETTINGS,
  loadNotesAppSettings,
  saveNotesAppSettings,
} from './notesAppSettings'

describe('notesAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut', () => {
    expect(loadNotesAppSettings()).toEqual(DEFAULT_NOTES_APP_SETTINGS)
  })

  it('persiste et recharge les paramètres', () => {
    saveNotesAppSettings({ sortOrder: 'oldest', showContentPreview: false, lockEnabled: true })
    expect(loadNotesAppSettings()).toEqual({ sortOrder: 'oldest', showContentPreview: false, lockEnabled: true })
  })

  it('ignore les valeurs invalides dans le stockage', () => {
    localStorage.setItem('cloudity.notes.appSettings.v1', '{"sortOrder":"bad","showContentPreview":"yes"}')
    expect(loadNotesAppSettings()).toEqual(DEFAULT_NOTES_APP_SETTINGS)
  })
})
