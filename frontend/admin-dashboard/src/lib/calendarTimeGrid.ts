/** Grille horaire type Google Agenda : minutes locales 0–1440, hauteur proportionnelle. */

export const MINUTES_PER_DAY = 24 * 60
/** Largeur de la colonne des heures (doit correspondre à l’en-tête des jours dans CalendarPage). */
export const TIME_GUTTER_PX = 52
/** Hauteur d’une heure (style grille proche Google Agenda, lisible sans zoom manuel). */
export const DEFAULT_PX_PER_HOUR = 56
export const MIN_PX_PER_HOUR = 28
export const MAX_PX_PER_HOUR = 120
export const ZOOM_STEP_PX_PER_HOUR = 8

export function localDayStartMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

export function localDayEndMs(d: Date): number {
  return localDayStartMs(d) + 86400000
}

/** Segment horaire d’un événement sur un jour civil local (exclut all-day). */
export function timedEventSegmentOnDay(
  startISO: string,
  endISO: string,
  day: Date,
  allDay: boolean
): { startMin: number; endMin: number } | null {
  if (allDay) return null
  const day0 = localDayStartMs(day)
  const day1 = localDayEndMs(day)
  const es = new Date(startISO).getTime()
  const ee = new Date(endISO).getTime()
  const clipS = Math.max(es, day0)
  const clipE = Math.min(ee, day1)
  if (clipE <= clipS) return null
  const startMin = (clipS - day0) / 60000
  let endMin = (clipE - day0) / 60000
  const minDurMin = 18
  if (endMin - startMin < minDurMin) {
    endMin = startMin + minDurMin
  }
  if (endMin > MINUTES_PER_DAY) endMin = MINUTES_PER_DAY
  return { startMin, endMin }
}

/** Tâche avec échéance ce jour : bloc court (échéance → +45 min) pour la grille. */
export function taskSegmentOnDay(dueISO: string | null | undefined, day: Date, completed: boolean): { startMin: number; endMin: number } | null {
  if (!dueISO || completed) return null
  const due = new Date(dueISO)
  if (Number.isNaN(due.getTime())) return null
  const day0 = localDayStartMs(day)
  const day1 = localDayEndMs(day)
  const t = due.getTime()
  if (t < day0 || t >= day1) return null
  const startMin = (t - day0) / 60000
  const endMin = Math.min(startMin + 45, MINUTES_PER_DAY)
  return { startMin, endMin }
}

export type TimeLaneItem = {
  id: string
  kind: 'event' | 'task'
  startMin: number
  endMin: number
  title: string
  color: string
  eventId?: number
  taskId?: number
}

/** Piste verticale : assigne lane et laneCount (nombre de colonnes du jour). */
export function assignTimeLanes<T extends { startMin: number; endMin: number }>(items: T[]): (T & { lane: number; laneCount: number })[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const laneEnds: number[] = []
  const temp: (T & { lane: number })[] = []
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end <= it.startMin)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(it.endMin)
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane], it.endMin)
    }
    temp.push({ ...it, lane })
  }
  const laneCount = Math.max(1, laneEnds.length)
  return temp.map((t) => ({ ...t, laneCount }))
}

export function minutesToY(min: number, pxPerHour: number): number {
  return (min / 60) * pxPerHour
}

export function durationToHeight(startMin: number, endMin: number, pxPerHour: number): number {
  return Math.max(((endMin - startMin) / 60) * pxPerHour, 20)
}
