import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, ChevronLeft, ChevronRight, Loader2, Plus, LayoutGrid, List, Trash2 } from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchCalendarEvents,
  createCalendarEvent,
  fetchUserCalendars,
  createUserCalendar,
  deleteCalendarEvent,
  type CalendarEvent,
  type UserCalendar,
} from '../../api'
import { addMonths, eventTouchesDay, getMonthGridCells, isSameMonth, sameDay } from '../../lib/calendarGrid'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

export default function CalendarPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(null)
  const [pickedDay, setPickedDay] = useState<Date | null>(null)
  const [title, setTitle] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [newCalName, setNewCalName] = useState('')
  const [newCalColor, setNewCalColor] = useState('#ea4335')

  const { data: calendars = [], isLoading: calLoading } = useQuery({
    queryKey: ['calendar', 'calendars'],
    queryFn: () => fetchUserCalendars(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })

  /** Un seul agenda (ex. « Mon agenda » créé côté API) : le sélectionner pour filtrer les événements par défaut. */
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

  const calMap = useMemo(() => {
    const m = new Map<number, UserCalendar>()
    calendars.forEach((c) => m.set(c.id, c))
    return m
  }, [calendars])

  const monthCells = useMemo(() => getMonthGridCells(anchor), [anchor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const cell of monthCells) {
      const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`
      const list = events.filter((e) => eventTouchesDay(e.start_at, e.end_at, cell))
      if (list.length) map.set(key, list)
    }
    return map
  }, [events, monthCells])

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

  const loading = calLoading || evLoading

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch min-h-0">
      {/* Sidebar agendas */}
      <aside className="w-full lg:w-56 shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 space-y-3">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold text-sm">
          <Calendar className="h-4 w-4" />
          Mes agendas
        </div>
        <button
          type="button"
          onClick={() => setSelectedCalendarId(null)}
          className={`w-full text-left rounded-lg px-2 py-2 text-sm ${selectedCalendarId == null ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          Tous les agendas
        </button>
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {calendars.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCalendarId(c.id)}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-left ${selectedCalendarId === c.id ? 'bg-slate-100 dark:bg-slate-700 ring-1 ring-brand-400' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color_hex }} aria-hidden />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-200 dark:border-slate-600 pt-2 space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Nouvel agenda</p>
          <input
            value={newCalName}
            onChange={(e) => setNewCalName(e.target.value)}
            placeholder="Travail, Perso…"
            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
          />
          <input type="color" value={newCalColor} onChange={(e) => setNewCalColor(e.target.value)} className="h-8 w-full rounded cursor-pointer" title="Couleur" />
          <button
            type="button"
            disabled={!newCalName.trim() || createCalMutation.isPending}
            onClick={() => createCalMutation.mutate()}
            className="w-full rounded-lg bg-brand-600 text-white text-xs py-2 font-medium disabled:opacity-50"
          >
            {createCalMutation.isPending ? '…' : 'Créer'}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Liens :{' '}
          <Link to="/app/contacts" className="text-brand-600 dark:text-brand-400 hover:underline">Contacts</Link>
          {' · '}
          <Link to="/app/drive" className="text-brand-600 dark:text-brand-400 hover:underline">Drive</Link>
        </p>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto overscroll-contain">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Calendrier</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Vue mois type Google Agenda. Sélectionnez un jour pour ajouter un événement.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView('month')}
              aria-label="Vue mois (grille)"
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${view === 'month' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-200' : 'border-slate-300 dark:border-slate-600'}`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden /> Mois
            </button>
            <button
              type="button"
              onClick={() => setView('agenda')}
              aria-label="Vue agenda (liste)"
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${view === 'agenda' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-600'}`}
            >
              <List className="h-4 w-4" aria-hidden /> Agenda
            </button>
          </div>
        </div>

        {view === 'month' && (
          <div className="relative rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-0 max-h-[min(640px,calc(100dvh-13rem))]">
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-slate-900/60">
                <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
              </div>
            ) : null}
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40">
              <button type="button" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => setAnchor(addMonths(anchor, -1))} aria-label="Mois précédent">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                {anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => setAnchor(addMonths(anchor, 1))} aria-label="Mois suivant">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="shrink-0 grid grid-cols-7 text-center text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 border-r border-slate-100 dark:border-slate-700 last:border-r-0">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {monthCells.map((cell) => {
                  const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`
                  const dayEvents = eventsByDay.get(key) ?? []
                  const inMonth = isSameMonth(cell, anchor)
                  const isToday = sameDay(cell, new Date())
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setPickedDay(cell)
                        const y = cell.getFullYear()
                        const mo = String(cell.getMonth() + 1).padStart(2, '0')
                        const da = String(cell.getDate()).padStart(2, '0')
                        setStartAt(`${y}-${mo}-${da}T09:00`)
                        setEndAt(`${y}-${mo}-${da}T10:00`)
                      }}
                      className={`border-b border-r border-slate-100 dark:border-slate-700 p-1 text-left align-top min-h-[72px] hover:bg-slate-50 dark:hover:bg-slate-700/30 ${!inMonth ? 'bg-slate-50/60 dark:bg-slate-900/40 text-slate-400' : ''} ${isToday ? 'ring-1 ring-inset ring-brand-400' : ''}`}
                    >
                      <span className={`text-xs font-semibold ${inMonth ? 'text-slate-800 dark:text-slate-100' : ''}`}>{cell.getDate()}</span>
                      <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const cal = ev.calendar_id != null ? calMap.get(ev.calendar_id) : undefined
                          return (
                            <span
                              key={ev.id}
                              className="truncate rounded px-0.5 text-[10px] text-white"
                              style={{ backgroundColor: cal?.color_hex ?? '#1a73e8' }}
                              title={ev.title}
                            >
                              {ev.title}
                            </span>
                          )
                        })}
                        {dayEvents.length > 3 ? <span className="text-[9px] text-slate-500">+{dayEvents.length - 3}</span> : null}
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>
        )}

        {view === 'agenda' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-0 max-h-[min(480px,calc(100dvh-14rem))]">
            <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-200">Liste des événements</div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : events.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Aucun événement sur la période filtrée.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {events.map((e) => {
                  const cal = e.calendar_id != null ? calMap.get(e.calendar_id) : undefined
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cal?.color_hex ?? '#1a73e8' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{e.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(e.start_at).toLocaleString('fr-FR')} → {new Date(e.end_at).toLocaleString('fr-FR')}
                          {cal ? ` · ${cal.name}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(e.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {(pickedDay || view === 'agenda') && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {pickedDay ? `Nouvel événement — ${pickedDay.toLocaleDateString('fr-FR')}` : 'Nouvel événement'}
            </h2>
            <div className="flex flex-wrap gap-2 items-end">
              <input
                type="text"
                placeholder="Titre"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? '…' : 'Ajouter'}
              </button>
              {pickedDay ? (
                <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => setPickedDay(null)}>
                  Fermer
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
