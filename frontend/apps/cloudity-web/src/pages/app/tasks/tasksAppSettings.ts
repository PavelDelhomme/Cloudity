export type TasksAppSettings = {
  groupByDueDate: boolean
  showCompletedSection: boolean
}

const STORAGE_KEY = 'cloudity.tasks.appSettings.v1'

export const DEFAULT_TASKS_APP_SETTINGS: TasksAppSettings = {
  groupByDueDate: true,
  showCompletedSection: true,
}

export function loadTasksAppSettings(): TasksAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TASKS_APP_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<TasksAppSettings>
    return {
      groupByDueDate:
        typeof parsed.groupByDueDate === 'boolean'
          ? parsed.groupByDueDate
          : DEFAULT_TASKS_APP_SETTINGS.groupByDueDate,
      showCompletedSection:
        typeof parsed.showCompletedSection === 'boolean'
          ? parsed.showCompletedSection
          : DEFAULT_TASKS_APP_SETTINGS.showCompletedSection,
    }
  } catch {
    return { ...DEFAULT_TASKS_APP_SETTINGS }
  }
}

export function saveTasksAppSettings(settings: TasksAppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
