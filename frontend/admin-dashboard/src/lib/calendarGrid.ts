/** Grille type Google Agenda : semaine commence lundi. */

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
