import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../../authContext'
import { fetchCalendarEvents, createCalendarEvent } from '../../api'

export default function CalendarPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => fetchCalendarEvents(accessToken!),
    enabled: Boolean(accessToken),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createCalendarEvent(accessToken!, {
        title: title || 'Sans titre',
        start_at: startAt || new Date().toISOString(),
        end_at: endAt || new Date(Date.now() + 3600000).toISOString(),
        all_day: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
      setTitle('')
      setStartAt('')
      setEndAt('')
      toast.success('Événement créé')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/app" className="hover:text-slate-700">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Calendar</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Agenda</h1>
        <p className="mt-1 text-sm text-slate-500">Événements et rendez-vous.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center justify-between">
          <span className="font-medium text-slate-700">Événements</span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
            />
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>
        <div className="p-4">
          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucun événement.</p>
              <p className="mt-1 text-sm text-slate-500">Ajoutez un événement ci-dessus.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map((e) => (
                <li key={e.id} className="py-3 flex items-center gap-3">
                  <span className="font-medium text-slate-900">{e.title}</span>
                  <span className="text-sm text-slate-500">
                    {new Date(e.start_at).toLocaleString()} → {new Date(e.end_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
