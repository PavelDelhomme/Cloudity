import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ListTodo, Loader2, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../authContext'
import CalendarTimeGrid from '../../components/CalendarTimeGrid'
import {
  fetchCalendarEvents,
  createCalendarEvent,
  fetchUserCalendars,
  createUserCalendar,
  deleteCalendarEvent,
  fetchTasks,
  type CalendarEvent,
  type UserCalendar,
} from '../../api'
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
  dayKey,
} from '../../lib/calendarGrid'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const MINI_WEEK_HEADERS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

export type CalView = 'day' | '3day' | '5day' | 'week' | '12weeks' | 'month' | 'year' | 'agenda'

function viewNavLabel(calView: CalView, anchor: Date): string {
  switch (calView) {
    case 'day':
      return anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    case '3day': {
      const d = getThreeDays(anchor)
      return `${d[0].toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} — ${d[2].toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    case '5day': {
      const days = getFiveWorkdays(anchor)
      const a = days[0]
      const b = days[4]
      return `Du ${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    case 'week': {
      const days = getWeekDays(anchor)
      const a = days[0]
      const b = days[6]
      return `Semaine du ${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    case '12weeks': {
      const mon = getTwelveWeeksGrid(anchor)[0][0]
      const end = getTwelveWeeksGrid(anchor)[11][6]
      return `${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} (12 sem.)`
    }
    case 'month':
      return anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    case 'year':
      return String(anchor.getFullYear())
    case 'agenda':
      return anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    default:
      return ''
  }
}

function currentViewShortLabel(v: CalView): string {
  switch (v) {
    case 'day':
      return 'Jour'
    case '3day':
      return '3 jours'
    case '5day':
      return 'Semaine de travail'
    case 'week':
      return 'Semaine'
    case '12weeks':
      return '12 semaines'
    case 'month':
      return 'Mois'
    case 'year':
      return 'Année'
    case 'agenda':
      return 'Agenda'
    default:
      return 'Semaine'
  }
}

const VIEW_MENU_ITEMS: { id: CalView; label: string; hint?: string }[] = [
  { id: 'day', label: 'Jour' },
  { id: '3day', label: '3 jours' },
  { id: '5day', label: '5 jours (lun.–ven.)' },
  { id: 'week', label: 'Semaine (lun.–dim.)' },
  { id: '12weeks', label: '12 semaines', hint: 'Aperçu compact' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
  { id: 'agenda', label: 'Agenda', hint: 'Liste des événements' },
]

export default function CalendarPage() {
  const { accessToken, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState(() => new Date())
  const [calView, setCalView] = useState<CalView>('week')
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(null)
  const [pickedDay, setPickedDay] = useState<Date | null>(null)
  const [title, setTitle] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [newCalName, setNewCalName] = useState('')
  const [newCalColor, setNewCalColor] = useState('#ea4335')
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const fabMenuRef = useRef<HTMLDivElement>(null)

  const { data: calendars = [], isLoading: calLoading } = useQuery({
    queryKey: ['calendar', 'calendars'],
    queryFn: () => fetchUserCalendars(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!calLoading && calendars.length === 1 && selectedCalendarId === null) {
      setSelectedCalendarId(calendars[0].id)
    }
  }, [calLoading, calendars, selectedCalendarId])

  const { data: events = [], isLoading: evLoading, error } = useQuery({
    queryKey: ['calendar', 'events', selectedCalendarId],
    queryFn: () => fetchCalendarEvents(accessToken!, selectedCalendarId),
    enabled: Boolean(accessToken),
    staleTime: 15_000,
  })

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', 'calendar-overlay'],
    queryFn: () => fetchTasks(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })
  const tasks = tasksData ?? []

  const calMap = useMemo(() => {
    const m = new Map<number, UserCalendar>()
    calendars.forEach((c) => m.set(c.id, c))
    return m
  }, [calendars])

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events]
  )

  const monthCells = useMemo(() => getMonthGridCells(anchor), [anchor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const cell of monthCells) {
      const key = dayKey(cell)
      const list = events.filter((e) => eventTouchesDay(e.start_at, e.end_at, cell))
      if (list.length) map.set(key, list)
    }
    return map
  }, [events, monthCells])

  const eventsOnDay = useCallback(
    (d: Date) => events.filter((e) => eventTouchesDay(e.start_at, e.end_at, d)),
    [events]
  )

  const navPrev = useCallback(() => {
    switch (calView) {
      case 'day':
        setAnchor((a) => addDays(a, -1))
        break
      case '3day':
        setAnchor((a) => addDays(a, -3))
        break
      case '5day':
      case 'week':
        setAnchor((a) => addDays(a, -7))
        break
      case '12weeks':
        setAnchor((a) => addDays(a, -84))
        break
      case 'month':
      case 'agenda':
        setAnchor((a) => addMonths(a, -1))
        break
      case 'year':
        setAnchor((a) => addYears(a, -1))
        break
      default:
        break
    }
  }, [calView])

  const navNext = useCallback(() => {
    switch (calView) {
      case 'day':
        setAnchor((a) => addDays(a, 1))
        break
      case '3day':
        setAnchor((a) => addDays(a, 3))
        break
      case '5day':
      case 'week':
        setAnchor((a) => addDays(a, 7))
        break
      case '12weeks':
        setAnchor((a) => addDays(a, 84))
        break
      case 'month':
      case 'agenda':
        setAnchor((a) => addMonths(a, 1))
        break
      case 'year':
        setAnchor((a) => addYears(a, 1))
        break
      default:
        break
    }
  }, [calView])

  const setViewYear = useCallback(() => {
    setAnchor((a) => new Date(a.getFullYear(), 0, 1, 12, 0, 0, 0))
    setCalView('year')
  }, [])

  const goToday = useCallback(() => {
    setAnchor(new Date())
  }, [])

  useEffect(() => {
    if (!viewMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [viewMenuOpen])

  useEffect(() => {
    if (!fabMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (fabMenuRef.current && !fabMenuRef.current.contains(e.target as Node)) setFabMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [fabMenuOpen])

  const createMutation = useMutation({
    mutationFn: () =>
      createCalendarEvent(accessToken!, {
        title: title || 'Sans titre',
        start_at: startAt || new Date().toISOString(),
        end_at: endAt || new Date(Date.now() + 3600000).toISOString(),
        all_day: false,
        calendar_id: selectedCalendarId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
      setTitle('')
      setStartAt('')
      setEndAt('')
      setPickedDay(null)
      setComposeOpen(false)
      toast.success('Événement créé')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createCalMutation = useMutation({
    mutationFn: () => createUserCalendar(accessToken!, { name: newCalName.trim(), color_hex: newCalColor }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'calendars'] })
      setNewCalName('')
      setSelectedCalendarId(r.id)
      toast.success('Agenda créé')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCalendarEvent(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
      toast.success('Événement supprimé')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (error && error instanceof Error && error.message.includes('401')) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-red-600 dark:text-red-400">
          Session expirée ou token invalide.
          <button
            type="button"
            onClick={() => {
              logout()
              toast.success('Reconnectez-vous.')
            }}
            className="ml-2 text-brand-600 dark:text-brand-400 hover:underline"
          >
            Se reconnecter
          </button>
        </p>
      </div>
    )
  }

  const loading = calLoading || evLoading || tasksLoading
  const navTitle = viewNavLabel(calView, anchor)

  const pickDayWithMinute = (cell: Date, minuteFromMidnight: number) => {
    setComposeOpen(true)
    setPickedDay(cell)
    const y = cell.getFullYear()
    const h = Math.floor(minuteFromMidnight / 60)
    const mi = minuteFromMidnight % 60
    const start = new Date(y, cell.getMonth(), cell.getDate(), h, mi, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const p = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setStartAt(p(start))
    setEndAt(p(end))
  }

  const pickDayAndForm = (cell: Date) => {
    pickDayWithMinute(cell, 9 * 60)
  }

  const openCreateFromFab = () => {
    setFabMenuOpen(false)
    setComposeOpen(true)
    if (calView === 'agenda' || calView === 'month' || calView === 'year' || calView === '12weeks' || pickedDay == null) {
      pickDayAndForm(new Date())
    }
  }

  const miniCalendarPrevMonth = () => {
    setAnchor((a) => addMonths(a, -1))
  }

  const miniCalendarNextMonth = () => {
    setAnchor((a) => addMonths(a, 1))
  }

  const miniCalendarPickDay = (cell: Date) => {
    setAnchor(new Date(cell.getFullYear(), cell.getMonth(), cell.getDate(), 12, 0, 0, 0))
  }

  const closeCompose = () => {
    setComposeOpen(false)
    setPickedDay(null)
    setTitle('')
    setStartAt('')
    setEndAt('')
  }

  const renderEventPill = (ev: CalendarEvent) => {
    const cal = ev.calendar_id != null ? calMap.get(ev.calendar_id) : undefined
    const bg = cal?.color_hex ?? '#1a73e8'
    return (
      <span
        key={ev.id}
        className="truncate block rounded border-l-[3px] border-white/50 pl-1.5 pr-1 py-0.5 text-left text-[11px] leading-tight font-medium text-white shadow-sm"
        style={{ backgroundColor: bg, borderLeftColor: 'rgba(255,255,255,0.35)' }}
        title={ev.title}
      >
        {ev.title}
      </span>
    )
  }

  const multiDayColumnGrid = (days: Date[], minCellH: string, fillVertical = true) => {
    const n = days.length
    return (
      <div
        className={`grid overflow-y-auto overscroll-contain border-t border-[#dadce0] dark:border-slate-600 bg-white dark:bg-slate-900 ${fillVertical ? 'min-h-0 flex-1' : ''}`}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {days.map((cell) => {
          const key = dayKey(cell)
          const dayEvents = eventsOnDay(cell)
          const isToday = sameDay(cell, new Date())
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickDayAndForm(cell)}
              className={`border-r border-[#dadce0] dark:border-slate-700 last:border-r-0 p-2 text-left align-top hover:bg-[#f1f3f4] dark:hover:bg-slate-800/80 ${minCellH} ${
                isToday ? 'bg-[#e8f0fe] dark:bg-blue-950/40 ring-1 ring-inset ring-[#1a73e8]/40' : ''
              }`}
            >
              <span className={`text-xs font-medium ${isToday ? 'text-[#1a73e8]' : 'text-[#3c4043] dark:text-slate-200'}`}>
                {cell.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
              </span>
              <div className="mt-2 flex flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 5).map((ev) => renderEventPill(ev))}
                {dayEvents.length > 5 ? <span className="text-[10px] text-[#5f6368] dark:text-slate-500">+{dayEvents.length - 5}</span> : null}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const headerDaysRow = (): Date[] => {
    if (calView === 'day') return [anchor]
    if (calView === '3day') return getThreeDays(anchor)
    if (calView === '5day') return getFiveWorkdays(anchor)
    return getWeekDays(anchor)
  }

  const showComposePanel = composeOpen || pickedDay != null

  return (
    <div className="-m-6 flex h-[calc(100dvh-6.25rem)] min-h-[28rem] max-h-[calc(100dvh-6.25rem)] flex-col gap-0 overflow-hidden bg-[#f1f3f4] dark:bg-slate-950 lg:flex-row">
      <aside className="w-full shrink-0 border-b border-[#dadce0] bg-white dark:border-slate-700 dark:bg-slate-900 lg:w-[17rem] lg:border-b-0 lg:border-r p-3 lg:min-h-0 lg:overflow-y-auto">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#3c4043] dark:text-slate-100">
          <Calendar className="h-4 w-4 text-[#5f6368] dark:text-slate-400" />
          Mes agendas
        </div>
        <div className="mt-3 rounded-lg border border-[#dadce0] bg-[#fafafa] p-2 dark:border-slate-600 dark:bg-slate-800/50">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={miniCalendarPrevMonth}
              className="rounded-full p-1 text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-xs font-medium capitalize text-[#3c4043] dark:text-slate-100">
              {anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={miniCalendarNextMonth}
              className="rounded-full p-1 text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {MINI_WEEK_HEADERS.map((h) => (
              <div key={h} className="py-0.5 text-[10px] font-medium text-[#80868b] dark:text-slate-500">
                {h}
              </div>
            ))}
          </div>
          <div className="mt-0.5 grid grid-cols-7 gap-px">
            {monthCells.map((cell) => {
              const inMonth = isSameMonth(cell, anchor)
              const isTodayCell = sameDay(cell, new Date())
              const isSelected = sameDay(cell, anchor)
              const hasEvents = eventsOnDay(cell).length > 0
              return (
                <button
                  key={dayKey(cell)}
                  type="button"
                  onClick={() => miniCalendarPickDay(cell)}
                  className={`flex min-h-[1.75rem] flex-col items-center justify-center rounded-md text-[11px] leading-tight transition-colors ${
                    isSelected
                      ? 'bg-[#1a73e8] font-semibold text-white dark:bg-blue-600'
                      : inMonth
                        ? 'text-[#3c4043] hover:bg-[#e8f0fe] dark:text-slate-100 dark:hover:bg-slate-700'
                        : 'text-[#b0b6bc] hover:bg-[#e8eaed]/80 dark:text-slate-600 dark:hover:bg-slate-700/50'
                  } ${isTodayCell && !isSelected ? 'ring-1 ring-inset ring-[#1a73e8]/50 dark:ring-blue-500/50' : ''}`}
                >
                  <span>{cell.getDate()}</span>
                  {hasEvents ? (
                    <span
                      className={`mt-0.5 h-1 w-1 shrink-0 rounded-full ${isSelected ? 'bg-white/90' : 'bg-[#1a73e8] dark:bg-blue-400'}`}
                      aria-hidden
                    />
                  ) : (
                    <span className="h-1 shrink-0" aria-hidden />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedCalendarId(null)}
          className={`mt-2 w-full rounded-lg px-2 py-2 text-left text-sm ${
            selectedCalendarId == null ? 'bg-[#e8f0fe] text-[#174ea6] dark:bg-blue-950/50 dark:text-blue-200' : 'hover:bg-[#f1f3f4] dark:hover:bg-slate-800'
          }`}
        >
          Tous les agendas
        </button>
        <div className="mt-1 max-h-[32vh] space-y-0.5 overflow-y-auto lg:max-h-none">
          {calendars.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCalendarId(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                selectedCalendarId === c.id ? 'bg-[#f1f3f4] ring-1 ring-[#1a73e8]/30 dark:bg-slate-800 dark:ring-blue-500/40' : 'hover:bg-[#f8f9fa] dark:hover:bg-slate-800/80'
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color_hex }} aria-hidden />
              <span className="truncate text-[#3c4043] dark:text-slate-200">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2 border-t border-[#dadce0] pt-3 dark:border-slate-700">
          <p className="text-xs font-medium text-[#5f6368] dark:text-slate-400">Nouvel agenda</p>
          <input
            value={newCalName}
            onChange={(e) => setNewCalName(e.target.value)}
            placeholder="Travail, Perso…"
            className="w-full rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input type="color" value={newCalColor} onChange={(e) => setNewCalColor(e.target.value)} className="h-8 w-full cursor-pointer rounded-lg" title="Couleur" />
          <button
            type="button"
            disabled={!newCalName.trim() || createCalMutation.isPending}
            onClick={() => createCalMutation.mutate()}
            className="w-full rounded-lg bg-[#1a73e8] py-2 text-xs font-medium text-white hover:bg-[#1557b0] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {createCalMutation.isPending ? '…' : 'Créer'}
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 lg:pr-4">
        <div className="shrink-0 border-b border-transparent pb-2">
          <h1 className="text-[22px] font-normal leading-8 tracking-tight text-[#3c4043] dark:text-slate-100" style={{ fontFamily: 'Google Sans, system-ui, sans-serif' }}>
            Calendrier
          </h1>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-[#5f6368] dark:text-slate-400">
            Présentation proche d&apos;Google Agenda : mini-calendrier dans la barre latérale, grille pleine hauteur, vues dans un menu, événements et tâches ; création via le bouton flottant (menu Événement / Tâche).
          </p>
        </div>

        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e8eaed] pb-2 dark:border-slate-700/80">
          <button
            type="button"
            onClick={goToday}
            className="rounded border border-[#dadce0] bg-white px-3 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-[#f1f3f4] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Aujourd&apos;hui
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center sm:justify-start">
            <div className="flex max-w-full items-center overflow-hidden rounded border border-[#dadce0] bg-white dark:border-slate-600 dark:bg-slate-800">
              <button
                type="button"
                className="p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={navPrev}
                aria-label="Période précédente"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-0 max-w-[min(100vw-12rem,28rem)] truncate px-2 py-1 text-center text-sm font-medium text-[#3c4043] dark:text-slate-100">
                {navTitle}
              </span>
              <button
                type="button"
                className="p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={navNext}
                aria-label="Période suivante"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative ml-auto shrink-0" ref={viewMenuRef}>
            <button
              type="button"
              aria-label={`Vue : ${currentViewShortLabel(calView)}`}
              aria-expanded={viewMenuOpen}
              aria-haspopup="listbox"
              aria-controls="cal-view-menu"
              id="cal-view-trigger"
              onClick={() => setViewMenuOpen((o) => !o)}
              className="inline-flex h-9 min-w-[7.5rem] items-center justify-between gap-2 rounded border border-[#dadce0] bg-white px-3 text-sm font-medium text-[#3c4043] hover:bg-[#f8f9fa] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span aria-hidden>{currentViewShortLabel(calView)}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-[#5f6368] transition-transform ${viewMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {viewMenuOpen ? (
              <ul
                id="cal-view-menu"
                role="listbox"
                aria-labelledby="cal-view-trigger"
                className="absolute right-0 z-40 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-[#dadce0] bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
              >
                {VIEW_MENU_ITEMS.map((item) => (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-label={item.label}
                      aria-selected={calView === item.id}
                      className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#f1f3f4] dark:hover:bg-slate-700/80 ${
                        calView === item.id ? 'bg-[#e8f0fe] text-[#174ea6] dark:bg-blue-950/40 dark:text-blue-200' : 'text-[#3c4043] dark:text-slate-200'
                      }`}
                      onClick={() => {
                        setViewMenuOpen(false)
                        if (item.id === 'year') setViewYear()
                        else setCalView(item.id)
                      }}
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.hint ? <span className="text-xs font-normal text-[#5f6368] dark:text-slate-400">{item.hint}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#dadce0] bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-slate-900/70">
              <Loader2 className="h-10 w-10 animate-spin text-[#1a73e8]" />
            </div>
          ) : null}

          {calView === 'month' && (
            <>
              <div className="grid shrink-0 grid-cols-7 border-b border-[#dadce0] bg-[#f8f9fa] text-center text-[11px] font-medium uppercase tracking-wide text-[#5f6368] dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="border-r border-[#dadce0] py-2 last:border-r-0 dark:border-slate-600">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto overscroll-contain">
                {monthCells.map((cell) => {
                  const key = dayKey(cell)
                  const dayEvents = eventsByDay.get(key) ?? []
                  const inMonth = isSameMonth(cell, anchor)
                  const isToday = sameDay(cell, new Date())
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickDayAndForm(cell)}
                      className={`min-h-[4.5rem] border-b border-r border-[#dadce0] p-1.5 text-left align-top hover:bg-[#f8f9fa] dark:border-slate-700 dark:hover:bg-slate-800/50 ${
                        !inMonth ? 'bg-[#f8f9fa]/80 text-[#9aa0a6] dark:bg-slate-900/50 dark:text-slate-500' : ''
                      } ${isToday ? 'ring-1 ring-inset ring-[#1a73e8]/50' : ''}`}
                    >
                      <span
                        className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? 'bg-[#1a73e8] text-white' : inMonth ? 'text-[#3c4043] dark:text-slate-100' : ''
                        }`}
                      >
                        {cell.getDate()}
                      </span>
                      <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => renderEventPill(ev))}
                        {dayEvents.length > 3 ? <span className="text-[10px] text-[#5f6368] dark:text-slate-500">+{dayEvents.length - 3}</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {(calView === 'day' || calView === '3day' || calView === '5day' || calView === 'week' || calView === '12weeks') && calView !== 'month' && (
            <>
              {calView !== '12weeks' && (
                <div
                  className="grid shrink-0 border-b border-[#dadce0] bg-[#f8f9fa] text-center text-[11px] font-medium text-[#5f6368] dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300 sm:text-xs"
                  style={{
                    gridTemplateColumns: `repeat(${headerDaysRow().length}, minmax(0, 1fr))`,
                  }}
                >
                  {headerDaysRow().map((d) => (
                    <div key={dayKey(d)} className="truncate border-r border-[#dadce0] px-0.5 py-2 last:border-r-0 dark:border-slate-600">
                      {d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: calView === 'day' ? 'long' : 'short' })}
                    </div>
                  ))}
                </div>
              )}
              {calView === 'day' && (
                <CalendarTimeGrid
                  days={[anchor]}
                  events={events}
                  tasks={tasks}
                  calMap={calMap}
                  onDeleteEvent={(id) => deleteMutation.mutate(id)}
                  onPickDay={(d, mins) => (mins != null ? pickDayWithMinute(d, mins) : pickDayAndForm(d))}
                />
              )}
              {calView === '3day' && (
                <CalendarTimeGrid
                  days={getThreeDays(anchor)}
                  events={events}
                  tasks={tasks}
                  calMap={calMap}
                  onDeleteEvent={(id) => deleteMutation.mutate(id)}
                  onPickDay={(d, mins) => (mins != null ? pickDayWithMinute(d, mins) : pickDayAndForm(d))}
                />
              )}
              {calView === '5day' && (
                <CalendarTimeGrid
                  days={getFiveWorkdays(anchor)}
                  events={events}
                  tasks={tasks}
                  calMap={calMap}
                  onDeleteEvent={(id) => deleteMutation.mutate(id)}
                  onPickDay={(d, mins) => (mins != null ? pickDayWithMinute(d, mins) : pickDayAndForm(d))}
                />
              )}
              {calView === 'week' && (
                <CalendarTimeGrid
                  days={getWeekDays(anchor)}
                  events={events}
                  tasks={tasks}
                  calMap={calMap}
                  onDeleteEvent={(id) => deleteMutation.mutate(id)}
                  onPickDay={(d, mins) => (mins != null ? pickDayWithMinute(d, mins) : pickDayAndForm(d))}
                />
              )}
              {calView === '12weeks' && (
                <div className="min-h-0 flex-1 divide-y divide-[#dadce0] overflow-y-auto overscroll-contain dark:divide-slate-700">
                  {getTwelveWeeksGrid(anchor).map((weekDays, wi) => (
                    <div key={wi} className="px-1 py-2">
                      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-slate-500">
                        Semaine {wi + 1} · {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                      {multiDayColumnGrid(weekDays, 'min-h-[3.5rem]', false)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {calView === 'year' && (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
              {getYearMonthStarts(anchor.getFullYear()).map((m) => {
                const monthEv = sortedEvents.filter((e) => {
                  const t = new Date(e.start_at)
                  return t.getFullYear() === m.getFullYear() && t.getMonth() === m.getMonth()
                })
                return (
                  <div key={m.getMonth()} className="min-h-[6rem] rounded-lg border border-[#dadce0] bg-[#f8f9fa] p-2 dark:border-slate-600 dark:bg-slate-800/50">
                    <p className="mb-1 text-xs font-semibold capitalize text-[#3c4043] dark:text-slate-100">{m.toLocaleDateString('fr-FR', { month: 'long' })}</p>
                    <ul className="space-y-0.5">
                      {monthEv.slice(0, 4).map((ev) => (
                        <li key={ev.id} className="truncate text-[10px] text-[#5f6368] dark:text-slate-400" title={ev.title}>
                          {new Date(ev.start_at).getDate()} — {ev.title}
                        </li>
                      ))}
                    </ul>
                    {monthEv.length > 4 ? <p className="mt-1 text-[9px] text-[#9aa0a6]">+{monthEv.length - 4}</p> : null}
                  </div>
                )
              })}
            </div>
          )}

          {calView === 'agenda' && (
            <>
              <div className="shrink-0 border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-2 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">Événements à venir</div>
              {sortedEvents.length === 0 ? (
                <p className="p-6 text-sm text-[#5f6368] dark:text-slate-400">Aucun événement sur la période filtrée.</p>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-[#dadce0] overflow-y-auto overscroll-contain dark:divide-slate-700">
                  {sortedEvents.map((e) => {
                    const cal = e.calendar_id != null ? calMap.get(e.calendar_id) : undefined
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9fa] dark:hover:bg-slate-800/50">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cal?.color_hex ?? '#1a73e8' }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[#3c4043] dark:text-slate-100">{e.title}</p>
                          <p className="text-xs text-[#5f6368] dark:text-slate-400">
                            {new Date(e.start_at).toLocaleString('fr-FR')} → {new Date(e.end_at).toLocaleString('fr-FR')}
                            {cal ? ` · ${cal.name}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(e.id)}
                          className="rounded-lg p-2 text-[#5f6368] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {showComposePanel ? (
          <div className="mt-2 shrink-0 rounded-xl border border-[#dadce0] bg-white p-3 shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] dark:border-slate-600 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#3c4043] dark:text-slate-100">
                <Plus className="h-4 w-4 text-[#1a73e8]" aria-hidden />
                {pickedDay ? `Nouvel événement — ${pickedDay.toLocaleDateString('fr-FR')}` : 'Nouvel événement'}
              </h2>
              <button type="button" className="rounded-full p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] dark:text-slate-400 dark:hover:bg-slate-800" onClick={closeCompose} aria-label="Fermer le formulaire">
                <span className="sr-only">Fermer</span>
                <span className="text-lg leading-none" aria-hidden>
                  ×
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="text"
                placeholder="Titre"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-[140px] flex-1 rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1557b0] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {createMutation.isPending ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : null}

        <div ref={fabMenuRef} className="fixed bottom-8 right-6 z-30 flex flex-col items-end gap-2">
          {fabMenuOpen ? (
            <div
              role="menu"
              className="mb-1 w-[13.5rem] overflow-hidden rounded-xl border border-[#dadce0] bg-white py-1 shadow-[0_1px_2px_rgba(60,64,67,.3),0_2px_6px_2px_rgba(60,64,67,.15)] dark:border-slate-600 dark:bg-slate-900"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3c4043] hover:bg-[#f1f3f4] dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={openCreateFromFab}
              >
                <Calendar className="h-4 w-4 shrink-0 text-[#5f6368] dark:text-slate-400" aria-hidden />
                Événement
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#3c4043] hover:bg-[#f1f3f4] dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setFabMenuOpen(false)
                  navigate('/app/tasks')
                }}
              >
                <ListTodo className="h-4 w-4 shrink-0 text-[#5f6368] dark:text-slate-400" aria-hidden />
                Tâche
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setFabMenuOpen((o) => !o)}
            aria-expanded={fabMenuOpen}
            aria-haspopup="menu"
            className="flex h-14 items-center gap-2 rounded-full bg-[#1a73e8] pl-4 pr-4 text-sm font-medium text-white shadow-[0_1px_2px_rgba(60,64,67,.3),0_2px_6px_2px_rgba(60,64,67,.15)] transition hover:bg-[#1557b0] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8] dark:bg-blue-600 dark:hover:bg-blue-500 sm:pr-5"
            aria-label="Créer : ouvrir le menu"
          >
            <Plus className="h-6 w-6 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">Créer</span>
            <ChevronDown className={`hidden h-4 w-4 shrink-0 opacity-90 transition-transform sm:block ${fabMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
