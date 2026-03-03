import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, ChevronRight, Plus, Loader2 } from 'lucide-react'
import { useAuth } from '../../authContext'
import { fetchCalendarEvents, createCalendarEvent } from '../../api'

export default function CalendarPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => fetchCalendarEvents(accessToken!),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const events = data ?? []

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

  if (error && error instanceof Error && error.message.includes('401')) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-red-600 dark:text-red-400">
          Session expirée ou token invalide.
          <button
            type="button"
            onClick={() => { logout(); toast.success('Reconnectez-vous.') }}
            className="ml-2 text-brand-600 dark:text-brand-400 hover:underline"
          >
            Se reconnecter
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Agenda</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Événements et rendez-vous.</p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3 flex items-center justify-between">
          <span className="font-medium text-slate-700 dark:text-slate-300">Événements</span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm w-40 text-slate-900 dark:text-slate-100"
            />
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-slate-900 dark:text-slate-100" />
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-slate-900 dark:text-slate-100" />
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-700 dark:hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <Calendar className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun événement.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ajoutez un événement ci-dessus pour commencer.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {events.map((e) => (
                <li key={e.id} className="py-3 flex items-center gap-3">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{e.title}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
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
