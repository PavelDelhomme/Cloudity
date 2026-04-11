import { describe, it, expect } from 'vitest'
import { addMonths, eventTouchesDay, getMonthGridCells, isSameMonth, sameDay, startOfMonth } from './calendarGrid'

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
})
