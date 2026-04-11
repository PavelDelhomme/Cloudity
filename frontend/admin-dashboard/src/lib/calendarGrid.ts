/** Grille type Google Agenda : semaine commence lundi. */

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0)
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 12, 0, 0, 0)
}

/** 42 cases (6 semaines) à partir du lundi précédant (ou égal) au 1er du mois. */
export function getMonthGridCells(anchorMonth: Date): Date[] {
  const first = startOfMonth(anchorMonth)
  const dow = first.getDay() // 0 Sun .. 6 Sat
  const mondayBased = (dow + 6) % 7 // Mon=0
  const start = new Date(first)
  start.setDate(first.getDate() - mondayBased)
  start.setHours(12, 0, 0, 0)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    cells.push(x)
  }
  return cells
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isSameMonth(a: Date, monthAnchor: Date): boolean {
  return a.getFullYear() === monthAnchor.getFullYear() && a.getMonth() === monthAnchor.getMonth()
}

/** L’événement intersecte le jour civil local [dayStart, dayEnd). */
export function eventTouchesDay(evStartISO: string, evEndISO: string, day: Date): boolean {
  const ds = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0)
  const de = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0)
  const s = new Date(evStartISO)
  const e = new Date(evEndISO)
  return s < de && e > ds
}

/** Lundi 12:00 de la semaine ISO « civile » contenant `d` (lundi = début). */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
  const dow = x.getDay()
  const off = (dow + 6) % 7
  x.setDate(x.getDate() - off)
  return x
}

export function addDays(d: Date, delta: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
  x.setDate(x.getDate() + delta)
  return x
}

export function addYears(d: Date, delta: number): Date {
  return new Date(d.getFullYear() + delta, d.getMonth(), d.getDate(), 12, 0, 0, 0)
}

/** Lundi à vendredi de la semaine de `anchor`. */
export function getFiveWorkdays(anchor: Date): Date[] {
  const mon = startOfWeekMonday(anchor)
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i))
}

/** Lundi → dimanche de la semaine de `anchor`. */
export function getWeekDays(anchor: Date): Date[] {
  const mon = startOfWeekMonday(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

/** Trois jours civils consécutifs à partir de la date locale de `anchor`. */
export function getThreeDays(anchor: Date): Date[] {
  const d0 = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0, 0)
  return [0, 1, 2].map((i) => addDays(d0, i))
}

/** 12 semaines consécutives : chaque ligne = 7 jours à partir du lundi de la semaine d’`anchor`. */
export function getTwelveWeeksGrid(anchor: Date): Date[][] {
  const mon = startOfWeekMonday(anchor)
  return Array.from({ length: 12 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(mon, w * 7 + d))
  )
}

/** 1er de chaque mois d’une année civile. */
export function getYearMonthStarts(year: number): Date[] {
  return Array.from({ length: 12 }, (_, m) => new Date(year, m, 1, 12, 0, 0, 0))
}
