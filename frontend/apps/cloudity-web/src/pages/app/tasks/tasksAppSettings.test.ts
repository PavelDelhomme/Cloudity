import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_TASKS_APP_SETTINGS,
  loadTasksAppSettings,
  saveTasksAppSettings,
} from './tasksAppSettings'

describe('tasksAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut', () => {
    expect(loadTasksAppSettings()).toEqual(DEFAULT_TASKS_APP_SETTINGS)
  })

  it('persiste et recharge les paramètres', () => {
    saveTasksAppSettings({ groupByDueDate: false, showCompletedSection: false })
    expect(loadTasksAppSettings()).toEqual({ groupByDueDate: false, showCompletedSection: false })
  })

  it('ignore les valeurs invalides dans le stockage', () => {
    localStorage.setItem('cloudity.tasks.appSettings.v1', '{"groupByDueDate":"yes","showCompletedSection":null}')
    expect(loadTasksAppSettings()).toEqual(DEFAULT_TASKS_APP_SETTINGS)
  })
})
