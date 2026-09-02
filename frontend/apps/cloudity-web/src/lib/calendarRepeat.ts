/** Récurrence agenda — alignée sur tasks.repeat_rule (pas de RRULE RFC). */

export type CalendarRepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export const CALENDAR_REPEAT_OPTIONS: { value: '' | CalendarRepeatRule; label: string }[] = [
  { value: '', label: 'Pas de répétition' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekdays', label: 'Jours ouvrés (lun–ven)' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
]

export function normalizeCalendarRepeat(raw?: string | null): CalendarRepeatRule | null {
  if (!raw) return null
  if (raw === 'daily' || raw === 'weekdays' || raw === 'weekly' || raw === 'monthly') return raw
  return null
}

function addOccurrence(start: Date, rule: CalendarRepeatRule): Date {
  const n = new Date(start.getTime())
  switch (rule) {
    case 'daily':
      n.setDate(n.getDate() + 1)
      return n
    case 'weekdays': {
      do {
        n.setDate(n.getDate() + 1)
      } while (n.getDay() === 0 || n.getDay() === 6)
      return n
    }
    case 'weekly':
      n.setDate(n.getDate() + 7)
      return n
    case 'monthly':
      n.setMonth(n.getMonth() + 1)
      return n
  }
}

export type ExpandedCalendarEvent<T extends { id: number; start_at: string; end_at: string; repeat_rule?: string | null }> =
  T & {
    /** Début de l’occurrence affichée (ISO). */
    occurrence_key: string
  }

/**
 * Déplie les événements récurrents dans [rangeStart, rangeEnd).
 * Les occurrences virtuelles partagent le même `id` (édition/suppression = série).
 */
export function expandCalendarEvents<
  T extends { id: number; start_at: string; end_at: string; repeat_rule?: string | null },
>(events: T[], rangeStart: Date, rangeEnd: Date): ExpandedCalendarEvent<T>[] {
  const out: ExpandedCalendarEvent<T>[] = []
  const maxOcc = 400

  for (const ev of events) {
    const rule = normalizeCalendarRepeat(ev.repeat_rule)
    const baseStart = new Date(ev.start_at)
    const baseEnd = new Date(ev.end_at)
    if (Number.isNaN(baseStart.getTime()) || Number.isNaN(baseEnd.getTime())) continue
    const durationMs = Math.max(0, baseEnd.getTime() - baseStart.getTime())

    if (!rule) {
      if (baseStart < rangeEnd && baseEnd > rangeStart) {
        out.push({ ...ev, occurrence_key: `${ev.id}:${baseStart.toISOString()}` })
      }
      continue
    }

    let cursor = new Date(baseStart.getTime())
    // Avancer jusqu’à entrer dans la fenêtre
    let guard = 0
    while (cursor.getTime() + durationMs <= rangeStart.getTime() && guard < 2000) {
      cursor = addOccurrence(cursor, rule)
      guard++
    }

    let n = 0
    while (cursor < rangeEnd && n < maxOcc) {
      const occEnd = new Date(cursor.getTime() + durationMs)
      if (cursor < rangeEnd && occEnd > rangeStart) {
        out.push({
          ...ev,
          start_at: cursor.toISOString(),
          end_at: occEnd.toISOString(),
          occurrence_key: `${ev.id}:${cursor.toISOString()}`,
        })
      }
      cursor = addOccurrence(cursor, rule)
      n++
    }
  }

  return out.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
}
