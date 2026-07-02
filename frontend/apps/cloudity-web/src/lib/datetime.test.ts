import { describe, expect, it } from 'vitest'
import { datetimeLocalInputToUtcIso, parseCloudityDateTime } from './datetime'

describe('parseCloudityDateTime', () => {
  it('interprète une date PostgreSQL sans fuseau comme UTC', () => {
    const d = parseCloudityDateTime('2026-06-16 12:52:00')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-06-16T12:52:00.000Z')
  })

  it('accepte RFC3339 avec offset', () => {
    const d = parseCloudityDateTime('2026-06-16T14:52:00+02:00')
    expect(d!.toISOString()).toBe('2026-06-16T12:52:00.000Z')
  })
})

describe('datetimeLocalInputToUtcIso', () => {
  it('convertit datetime-local en UTC (composants locaux)', () => {
    const iso = datetimeLocalInputToUtcIso('2026-06-16T14:52')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(52)
  })
})
