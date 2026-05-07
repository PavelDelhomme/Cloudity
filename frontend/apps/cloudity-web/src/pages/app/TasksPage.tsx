import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarClock, ListTodo, Plus, Trash2, FolderPlus, Repeat } from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchTaskLists,
  fetchTasks,
  createTask,
  createTaskList,
  updateTask,
  updateTaskCompleted,
  deleteTask,
  type Task,
} from '../../api'

const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Pas de répétition' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekdays', label: 'Jours ouvrés (lun–ven)' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
]

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromDatetimeLocalToISO(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'noDate'

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: 'En retard',
  today: "Aujourd'hui",
  tomorrow: 'Demain',
  week: 'Cette semaine',
  later: 'Plus tard',
  noDate: 'Sans date',
}

function dueBucket(dueAt: string | null | undefined, now: Date): DueBucket {
  if (!dueAt) return 'noDate'
  const due = new Date(dueAt).getTime()
  const t0 = startOfLocalDay(now)
  const day = 86400000
  const t1 = t0 + day
  const t2 = t1 + day
  const weekEnd = t0 + 7 * day
  if (due < t0) return 'overdue'
  if (due >= t0 && due < t1) return 'today'
  if (due >= t1 && due < t2) return 'tomorrow'
  if (due >= t1 && due < weekEnd) return 'week'
  return 'later'
}

function repeatLabel(rule?: string | null): string {
  if (!rule) return ''
  const o = REPEAT_OPTIONS.find((x) => x.value === rule)
  return o?.label ?? String(rule)
}

export default function TasksPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newRepeat, setNewRepeat] = useState('')
  const [newListName, setNewListName] = useState('')

  const { data: listsData } = useQuery({
    queryKey: ['tasks', 'lists'],
    queryFn: () => fetchTaskLists(accessToken!),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const lists = listsData ?? []

  const { data: tasksData, isLoading, error } = useQuery({
    queryKey: ['tasks', selectedListId],
    queryFn: () => fetchTasks(accessToken!, selectedListId),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const tasks = tasksData ?? []

  const createMutation = useMutation({
    mutationFn: () =>
      createTask(accessToken!, {
        title: newTaskTitle.trim() || 'Nouvelle tâche',
        list_id: selectedListId,
        due_at: fromDatetimeLocalToISO(newDue),
        repeat_rule: newRepeat || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setNewTaskTitle('')
      setNewDue('')
      setNewRepeat('')
      toast.success('Tâche créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createListMutation = useMutation({
    mutationFn: () => createTaskList(accessToken!, newListName.trim() || 'Ma liste'),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'lists'] })
      setSelectedListId(r.id)
      setNewListName('')
      toast.success('Liste créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      updateTaskCompleted(accessToken!, id, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const patchMutation = useMutation({
    mutationFn: (p: { id: number } & Partial<{ title: string; due_at: string | null; repeat_rule: string | null }>) => {
      const { id, ...rest } = p
      return updateTask(accessToken!, id, rest)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTask(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Tâche supprimée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const groupedOpen = useMemo(() => {
    const now = new Date()
    const open = tasks.filter((t) => !t.completed)
    const buckets: Record<DueBucket, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      noDate: [],
    }
    for (const t of open) {
      buckets[dueBucket(t.due_at, now)].push(t)
    }
    const order: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDate']
    const sortInBucket = (a: Task, b: Task) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
      const db = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
      if (da !== db) return da - db
      return a.title.localeCompare(b.title, 'fr')
    }
    for (const k of order) {
      buckets[k].sort(sortInBucket)
    }
    return order.map((k) => ({ key: k, label: BUCKET_LABEL[k], items: buckets[k] })).filter((g) => g.items.length > 0)
  }, [tasks])

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.completed)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [tasks])

  const onTitleBlur = useCallback(
    (t: Task, next: string) => {
      const trimmed = next.trim()
      if (trimmed === t.title) return
      if (!trimmed) return
      patchMutation.mutate({ id: t.id, title: trimmed })
    },
    [patchMutation]
  )

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

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tâches</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Listes, échéances et répétitions — pensé pour le quotidien et la productivité.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedListId(null)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            selectedListId == null ? 'bg-brand-600 text-white dark:bg-brand-500' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          Toutes les tâches
        </button>
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setSelectedListId(l.id)}
            className={`max-w-[10rem] truncate rounded-full px-3 py-1.5 text-sm font-medium ${
              selectedListId === l.id ? 'bg-brand-600 text-white dark:bg-brand-500' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {l.name}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-800/80">
          <input
            type="text"
            placeholder="Nouvelle liste…"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="w-32 rounded border-0 bg-transparent px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-0 dark:text-slate-100 sm:w-40"
            onKeyDown={(e) => e.key === 'Enter' && newListName.trim() && createListMutation.mutate()}
          />
          <button
            type="button"
            disabled={!newListName.trim() || createListMutation.isPending}
            onClick={() => createListMutation.mutate()}
            className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-500"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Créer
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80 sm:flex-row sm:flex-wrap sm:items-end">
          <input
            type="text"
            placeholder="Titre de la tâche"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <CalendarClock className="h-3.5 w-3.5" />
              Échéance
              <input
                type="datetime-local"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <Repeat className="h-3.5 w-3.5" />
              Répétition
              <select
                value={newRepeat}
                onChange={(e) => setNewRepeat(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
                <ListTodo className="h-8 w-8 animate-pulse text-slate-400" />
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
                <ListTodo className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucune tâche.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ajoutez une tâche ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groupedOpen.map((group) => (
                <section key={group.key}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {group.label}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{group.items.length}</span>
                  </h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {group.items.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={(c) => toggleMutation.mutate({ id: t.id, completed: c })}
                        onTitleBlur={(title) => onTitleBlur(t, title)}
                        onDueChange={(iso) => patchMutation.mutate({ id: t.id, due_at: iso })}
                        onRepeatChange={(rule) => patchMutation.mutate({ id: t.id, repeat_rule: rule })}
                        onDelete={() => deleteMutation.mutate(t.id)}
                        disableActions={patchMutation.isPending || deleteMutation.isPending}
                      />
                    ))}
                  </ul>
                </section>
              ))}

              {completedTasks.length > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Terminées</h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {completedTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={(c) => toggleMutation.mutate({ id: t.id, completed: c })}
                        onTitleBlur={(title) => onTitleBlur(t, title)}
                        onDueChange={(iso) => patchMutation.mutate({ id: t.id, due_at: iso })}
                        onRepeatChange={(rule) => patchMutation.mutate({ id: t.id, repeat_rule: rule })}
                        onDelete={() => deleteMutation.mutate(t.id)}
                        disableActions={patchMutation.isPending || deleteMutation.isPending}
                        muted
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskRow({
  task: t,
  onToggle,
  onTitleBlur,
  onDueChange,
  onRepeatChange,
  onDelete,
  disableActions,
  muted,
}: {
  task: Task
  onToggle: (completed: boolean) => void
  onTitleBlur: (title: string) => void
  onDueChange: (iso: string | null) => void
  onRepeatChange: (rule: string | null) => void
  onDelete: () => void
  disableActions?: boolean
  muted?: boolean
}) {
  const [titleDraft, setTitleDraft] = useState(t.title)
  useEffect(() => {
    setTitleDraft(t.title)
  }, [t.title])

  return (
    <li className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          type="checkbox"
          checked={t.completed}
          onChange={() => onToggle(!t.completed)}
          className="mt-1 rounded border-slate-300 dark:border-slate-500"
          aria-label={t.completed ? 'Marquer non terminée' : 'Marquer terminée'}
        />
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => onTitleBlur(titleDraft)}
          className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium outline-none ring-0 focus:ring-0 ${
            t.completed ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
          }`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <input
          type="datetime-local"
          value={toDatetimeLocalValue(t.due_at)}
          onChange={(e) => {
            const iso = fromDatetimeLocalToISO(e.target.value)
            onDueChange(iso)
          }}
          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          disabled={disableActions}
        />
        <select
          value={(t.repeat_rule as string) || ''}
          onChange={(e) => onRepeatChange(e.target.value || null)}
          className="max-w-[10rem] rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          disabled={disableActions}
          title={repeatLabel(t.repeat_rule as string)}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value || 'none'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          disabled={disableActions}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
          aria-label="Supprimer la tâche"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
