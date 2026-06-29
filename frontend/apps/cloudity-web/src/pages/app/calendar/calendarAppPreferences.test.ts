import { describe, it, expect, beforeEach } from 'vitest'
import { loadCalendarViewState, saveCalendarViewState } from './calendarAppPreferences'

describe('calendarAppPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persiste vue et agenda sélectionné', () => {
    saveCalendarViewState(1, 'u@test.com', { calView: 'month', selectedCalendarId: 3 })
    expect(loadCalendarViewState(1, 'u@test.com')).toEqual({
      calView: 'month',
      selectedCalendarId: 3,
    })
  })
})
