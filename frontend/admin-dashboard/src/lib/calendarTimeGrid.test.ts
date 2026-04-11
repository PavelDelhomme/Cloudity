import { describe, it, expect } from 'vitest'
import { assignTimeLanes, localDayStartMs, taskSegmentOnDay, timedEventSegmentOnDay } from './calendarTimeGrid'

describe('calendarTimeGrid', () => {
  it('timedEventSegmentOnDay : clippe sur le jour civil', () => {
    const day = new Date(2026, 3, 10, 12, 0, 0, 0)
    const start = new Date(2026, 3, 10, 10, 30, 0, 0).toISOString()
    const end = new Date(2026, 3, 10, 11, 45, 0, 0).toISOString()
    const seg = timedEventSegmentOnDay(start, end, day, false)
    expect(seg).not.toBeNull()
    expect(seg!.startMin).toBeCloseTo(10 * 60 + 30, 5)
    expect(seg!.endMin).toBeGreaterThan(seg!.startMin)
  })

  it('taskSegmentOnDay : échéance ce jour, non terminée', () => {
    const day = new Date(2026, 3, 10, 8, 0, 0, 0)
    const due = new Date(2026, 3, 10, 14, 0, 0, 0).toISOString()
    const seg = taskSegmentOnDay(due, day, false)
    expect(seg).not.toBeNull()
    expect(seg!.startMin).toBeCloseTo(14 * 60, 5)
  })

  it('taskSegmentOnDay : terminée ou sans date → null', () => {
    const day = new Date(2026, 3, 10, 8, 0, 0, 0)
    expect(taskSegmentOnDay(null, day, false)).toBeNull()
    expect(taskSegmentOnDay(new Date(2026, 3, 10, 12, 0, 0).toISOString(), day, true)).toBeNull()
  })

  it('assignTimeLanes : deux chevauchements → deux pistes', () => {
    const items = [
      { id: 'a', startMin: 0, endMin: 120 },
      { id: 'b', startMin: 60, endMin: 180 },
    ]
    const laid = assignTimeLanes(items)
    expect(laid).toHaveLength(2)
    expect(laid[0].laneCount).toBe(2)
    expect(laid[1].laneCount).toBe(2)
    expect(new Set(laid.map((x) => x.lane)).size).toBe(2)
  })

  it('localDayStartMs : minuit local', () => {
    const d = new Date(2026, 5, 15, 18, 30, 0, 0)
    const ms = localDayStartMs(d)
    const x = new Date(ms)
    expect(x.getHours()).toBe(0)
    expect(x.getMinutes()).toBe(0)
    expect(x.getDate()).toBe(15)
  })
})
