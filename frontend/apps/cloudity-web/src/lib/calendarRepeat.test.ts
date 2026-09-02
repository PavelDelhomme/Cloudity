import { describe, it, expect } from 'vitest'
import { expandCalendarEvents, normalizeCalendarRepeat } from './calendarRepeat'

describe('calendarRepeat', () => {
  it('normalize', () => {
    expect(normalizeCalendarRepeat('weekly')).toBe('weekly')
    expect(normalizeCalendarRepeat('')).toBeNull()
    expect(normalizeCalendarRepeat('nope')).toBeNull()
  })

  it('expand weekly into window', () => {
    const start = new Date('2026-08-31T10:00:00.000Z')
    const end = new Date('2026-08-31T11:00:00.000Z')
    const events = [
      {
        id: 1,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        repeat_rule: 'weekly',
        title: 'Standup',
      },
    ]
    const rangeStart = new Date('2026-08-31T00:00:00.000Z')
    const rangeEnd = new Date('2026-09-28T00:00:00.000Z')
    const expanded = expandCalendarEvents(events, rangeStart, rangeEnd)
    expect(expanded.length).toBeGreaterThanOrEqual(4)
    expect(expanded[0].id).toBe(1)
    expect(expanded.every((e) => e.title === 'Standup')).toBe(true)
  })

  it('non-repeating stays single', () => {
    const events = [
      {
        id: 2,
        start_at: '2026-09-01T09:00:00.000Z',
        end_at: '2026-09-01T10:00:00.000Z',
        title: 'Once',
      },
    ]
    const expanded = expandCalendarEvents(
      events,
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z')
    )
    expect(expanded).toHaveLength(1)
  })
})
