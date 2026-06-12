import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PHOTOS_APP_SETTINGS,
  loadPhotosAppSettings,
  photosGridClassName,
  savePhotosAppSettings,
} from './photosAppSettings'

describe('photosAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut', () => {
    expect(loadPhotosAppSettings()).toEqual(DEFAULT_PHOTOS_APP_SETTINGS)
  })

  it('persiste et recharge les paramètres', () => {
    savePhotosAppSettings({
      gridSize: 'compact',
      showDateSections: false,
      confirmArchiveLock: false,
    })
    expect(loadPhotosAppSettings()).toEqual({
      gridSize: 'compact',
      showDateSections: false,
      confirmArchiveLock: false,
    })
  })

  it('photosGridClassName adapte la grille', () => {
    expect(photosGridClassName('compact')).toContain('grid-cols-4')
    expect(photosGridClassName('large')).toContain('grid-cols-2')
    expect(photosGridClassName('normal')).toContain('grid-cols-3')
  })
})
