import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DRIVE_APP_SETTINGS,
  loadDriveAppSettings,
  saveDriveAppSettings,
} from './driveAppSettings'

describe('driveAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut', () => {
    expect(loadDriveAppSettings()).toEqual(DEFAULT_DRIVE_APP_SETTINGS)
  })

  it('persiste et recharge les paramètres', () => {
    saveDriveAppSettings({ displayMode: 'list', showRecentSection: false })
    expect(loadDriveAppSettings()).toEqual({ displayMode: 'list', showRecentSection: false })
  })

  it('migre les clés legacy localStorage', () => {
    localStorage.setItem('cloudity_drive_display', 'list')
    localStorage.setItem('cloudity_drive_recent_visible', 'false')
    expect(loadDriveAppSettings()).toEqual({ displayMode: 'list', showRecentSection: false })
  })
})
