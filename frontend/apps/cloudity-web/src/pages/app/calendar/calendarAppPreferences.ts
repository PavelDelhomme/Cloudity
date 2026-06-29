export type CalView =
  | 'day'
  | '3day'
  | '5day'
  | 'week'
  | '12weeks'
  | 'month'
  | 'year'
  | 'agenda'

export type CalendarViewState = {
  calView: CalView
  selectedCalendarId: number | null
}

const VALID_VIEWS = new Set<CalView>([
  'day',
  '3day',
  '5day',
  'week',
  '12weeks',
  'month',
  'year',
  'agenda',
])

function scopedKey(tenantId: number | null | undefined, email: string | null | undefined): string {
  const t = tenantId ?? 0
  const e = (email ?? '').trim().toLowerCase()
  return `cloudity.calendar.view.v1:${t}:${e}`
}

function parseView(raw: unknown): CalView {
  if (typeof raw === 'string' && VALID_VIEWS.has(raw as CalView)) return raw as CalView
  return 'week'
}

export function loadCalendarViewState(
  tenantId: number | null | undefined,
  email: string | null | undefined
): CalendarViewState {
  try {
    const raw = localStorage.getItem(scopedKey(tenantId, email))
    if (!raw) return { calView: 'week', selectedCalendarId: null }
    const parsed = JSON.parse(raw) as Partial<CalendarViewState>
    const selectedCalendarId =
      typeof parsed.selectedCalendarId === 'number' && parsed.selectedCalendarId > 0
        ? parsed.selectedCalendarId
        : null
    return {
      calView: parseView(parsed.calView),
      selectedCalendarId,
    }
  } catch {
    return { calView: 'week', selectedCalendarId: null }
  }
}

export function saveCalendarViewState(
  tenantId: number | null | undefined,
  email: string | null | undefined,
  state: CalendarViewState
): void {
  try {
    localStorage.setItem(scopedKey(tenantId, email), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
