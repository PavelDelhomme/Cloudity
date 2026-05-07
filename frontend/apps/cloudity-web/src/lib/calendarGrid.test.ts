import { describe, it, expect } from 'vitest'
import {
  addDays,
  addMonths,
  addYears,
  eventTouchesDay,
  getFiveWorkdays,
  getMonthGridCells,
  getThreeDays,
  getTwelveWeeksGrid,
  getWeekDays,
  getYearMonthStarts,
  isSameMonth,
  sameDay,
  startOfMonth,
  startOfWeekMonday,
} from './calendarGrid'

describe('calendarGrid', () => {
  it('getMonthGridCells renvoie exactement 42 jours', () => {
    const cells = getMonthGridCells(new Date(2026, 3, 11))
    expect(cells).toHaveLength(42)
  })

  it('la grille commence un lundi (1er avril 2026 = mercredi → premier jour < 1er du mois)', () => {
    const anchor = new Date(2026, 3, 1)
    const cells = getMonthGridCells(anchor)
    const first = cells[0]
    expect(first.getDay()).toBe(1)
    expect(first.getTime()).toBeLessThan(startOfMonth(anchor).getTime())
  })

  it('isSameMonth et sameDay', () => {
    const a = new Date(2026, 3, 15, 12, 0, 0, 0)
    const b = new Date(2026, 3, 15, 18, 0, 0, 0)
    expect(sameDay(a, b)).toBe(true)
    expect(isSameMonth(a, new Date(2026, 3, 1))).toBe(true)
    expect(isSameMonth(a, new Date(2026, 4, 1))).toBe(false)
  })

  it('addMonths conserve une date « midi » pour éviter les dérives DST', () => {
    const d = new Date(2026, 0, 15, 12, 0, 0, 0)
    const next = addMonths(d, 1)
    expect(next.getMonth()).toBe(1)
    expect(next.getFullYear()).toBe(2026)
  })

  it('eventTouchesDay : événement qui chevauche minuit du jour', () => {
    const day = new Date(2026, 5, 10, 12, 0, 0, 0)
    const start = new Date(2026, 5, 9, 22, 0, 0, 0).toISOString()
    const end = new Date(2026, 5, 10, 8, 0, 0, 0).toISOString()
    expect(eventTouchesDay(start, end, day)).toBe(true)
  })

  it('eventTouchesDay : événement strictement avant le jour', () => {
    const day = new Date(2026, 5, 10, 12, 0, 0, 0)
    const start = new Date(2026, 5, 8, 10, 0, 0, 0).toISOString()
    const end = new Date(2026, 5, 8, 11, 0, 0, 0).toISOString()
    expect(eventTouchesDay(start, end, day)).toBe(false)
  })

  it('startOfWeekMonday : mercredi 8 avril 2026 → lundi 6 avril', () => {
    const wed = new Date(2026, 3, 8, 15, 0, 0, 0)
    const mon = startOfWeekMonday(wed)
    expect(mon.getDay()).toBe(1)
    expect(mon.getDate()).toBe(6)
    expect(mon.getMonth()).toBe(3)
  })

  it('getThreeDays : trois jours civils à partir de l’ancre', () => {
    const anchor = new Date(2026, 3, 10, 8, 0, 0, 0)
    const three = getThreeDays(anchor)
    expect(three).toHaveLength(3)
    expect(three[0].getDate()).toBe(10)
    expect(three[1].getDate()).toBe(11)
    expect(three[2].getDate()).toBe(12)
  })

  it('getFiveWorkdays et getWeekDays : 5 puis 7 jours consécutifs à partir du lundi', () => {
    const anchor = new Date(2026, 3, 10, 12, 0, 0, 0) // vendredi
    const five = getFiveWorkdays(anchor)
    const seven = getWeekDays(anchor)
    expect(five).toHaveLength(5)
    expect(seven).toHaveLength(7)
    expect(five[0].getTime()).toBe(seven[0].getTime())
    expect(five[4].getTime()).toBe(seven[4].getTime())
    expect(seven[0].getDay()).toBe(1)
    expect(seven[6].getDay()).toBe(0)
  })

  it('getTwelveWeeksGrid : 12 lignes de 7 jours', () => {
    const grid = getTwelveWeeksGrid(new Date(2026, 3, 11, 12, 0, 0, 0))
    expect(grid).toHaveLength(12)
    expect(grid.every((row) => row.length === 7)).toBe(true)
    expect(grid[0][0].getTime()).toBe(startOfWeekMonday(new Date(2026, 3, 11, 12, 0, 0, 0)).getTime())
  })

  it('addDays et addYears', () => {
    const d = new Date(2026, 3, 15, 12, 0, 0, 0)
    expect(addDays(d, 1).getDate()).toBe(16)
    expect(addYears(d, 1).getFullYear()).toBe(2027)
  })

  it('getYearMonthStarts : 12 mois de l’année', () => {
    const starts = getYearMonthStarts(2026)
    expect(starts).toHaveLength(12)
    expect(starts[0].getMonth()).toBe(0)
    expect(starts[11].getMonth()).toBe(11)
    expect(starts.every((x) => x.getFullYear() === 2026)).toBe(true)
  })
})
