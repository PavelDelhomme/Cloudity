import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, EmptyState, ResponsivePage } from '@cloudity/ui'
import {
  CalendarClock,
  Calendar,
  ListTodo,
  Plus,
  Trash2,
  FolderPlus,
  Repeat,
  Settings,
  X,
  Star,
  CornerDownRight,
} from 'lucide-react'
import {
  DEFAULT_TASKS_APP_SETTINGS,
  loadTasksAppSettings,
  saveTasksAppSettings,
  type TasksAppSettings,
} from './tasksAppSettings'
import { useAuth } from '../../../authContext'
import {
  fetchTaskLists,
  fetchTasks,
  createTask,
  createTaskList,
  updateTask,
  updateTaskCompleted,
  deleteTask,
  createCalendarEvent,
  type Task,
} from '../../../api'

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

function isRootTask(t: Task): boolean {
  return t.parent_id == null || t.parent_id <= 0
}

export default function TasksPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newRepeat, setNewRepeat] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newStarred, setNewStarred] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [tasksSettings, setTasksSettings] = useState<TasksAppSettings>(() => loadTasksAppSettings())
  const [showTasksSettings, setShowTasksSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<TasksAppSettings>(() => loadTasksAppSettings())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showTasksSettings) {
        e.preventDefault()
        setShowTasksSettings(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTasksSettings])

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

  const childrenByParent = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (!isRootTask(t) && t.parent_id != null) {
        const arr = m.get(t.parent_id) ?? []
        arr.push(t)
        m.set(t.parent_id, arr)
      }
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1
        return a.title.localeCompare(b.title, 'fr')
      })
    }
    return m
  }, [tasks])

  const createMutation = useMutation({
    mutationFn: (extra?: { parent_id?: number; title?: string }) =>
      createTask(accessToken!, {
        title: (extra?.title ?? newTaskTitle).trim() || 'Nouvelle tâche',
        list_id: selectedListId,
        parent_id: extra?.parent_id ?? null,
        notes: extra?.parent_id ? '' : newNotes.trim() || null,
        start_at: extra?.parent_id ? null : fromDatetimeLocalToISO(newStart),
        due_at: extra?.parent_id ? null : fromDatetimeLocalToISO(newDue),
        repeat_rule: extra?.parent_id ? null : newRepeat || null,
        starred: extra?.parent_id ? false : newStarred,
      }),
    onSuccess: (_r, extra) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      if (!extra?.parent_id) {
        setNewTaskTitle('')
        setNewStart('')
        setNewDue('')
        setNewRepeat('')
        setNewNotes('')
        setNewStarred(false)
      }
      toast.success(extra?.parent_id ? 'Sous-tâche créée' : 'Tâche créée')
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
    mutationFn: (
      p: {
        id: number
      } & Partial<{
        title: string
        notes: string
        start_at: string | null
        due_at: string | null
        repeat_rule: string | null
        starred: boolean
      }>
    ) => {
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

  const toAgendaMutation = useMutation({
    mutationFn: async (t: Task) => {
      const start = t.start_at
        ? new Date(t.start_at)
        : t.due_at
          ? new Date(t.due_at)
          : (() => {
              const d = new Date()
              d.setMinutes(0, 0, 0)
              d.setHours(d.getHours() + 1)
              return d
            })()
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      return createCalendarEvent(accessToken!, {
        title: t.title.trim() || 'Tâche',
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        description: t.notes?.trim() || undefined,
      })
    },
    onSuccess: () => toast.success('Événement créé dans Agenda'),
    onError: (e: Error) => toast.error(e.message),
  })

  const sortOpenTasks = useCallback((a: Task, b: Task) => {
    if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1
    const da = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
    if (da !== db) return da - db
    return a.title.localeCompare(b.title, 'fr')
  }, [])

  const rootOpen = useMemo(() => tasks.filter((t) => !t.completed && isRootTask(t)), [tasks])

  const groupedOpen = useMemo(() => {
    const now = new Date()
    if (!tasksSettings.groupByDueDate) {
      const items = [...rootOpen].sort(sortOpenTasks)
      return items.length > 0 ? [{ key: 'all' as const, label: 'À faire', items }] : []
    }
    const buckets: Record<DueBucket, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      noDate: [],
    }
    for (const t of rootOpen) {
      buckets[dueBucket(t.due_at, now)].push(t)
    }
    const order: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDate']
    for (const k of order) {
      buckets[k].sort(sortOpenTasks)
    }
    return order.map((k) => ({ key: k, label: BUCKET_LABEL[k], items: buckets[k] })).filter((g) => g.items.length > 0)
  }, [rootOpen, tasksSettings.groupByDueDate, sortOpenTasks])

  const completedRoots = useMemo(() => {
    return tasks
      .filter((t) => t.completed && isRootTask(t))
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

  const renderTaskTree = (t: Task, muted?: boolean) => {
    const children = (childrenByParent.get(t.id) ?? []).filter((c) =>
      muted ? true : !c.completed || tasksSettings.showCompletedSection
    )
    return (
      <li key={t.id} className="list-none">
        <TaskRow
          task={t}
          depth={0}
          onToggle={(c) => toggleMutation.mutate({ id: t.id, completed: c })}
          onTitleBlur={(title) => onTitleBlur(t, title)}
          onNotesBlur={(notes) => {
            if ((t.notes || '') === notes) return
            patchMutation.mutate({ id: t.id, notes })
          }}
          onStartChange={(iso) => patchMutation.mutate({ id: t.id, start_at: iso })}
          onDueChange={(iso) => patchMutation.mutate({ id: t.id, due_at: iso })}
          onRepeatChange={(rule) => patchMutation.mutate({ id: t.id, repeat_rule: rule })}
          onStarToggle={() => patchMutation.mutate({ id: t.id, starred: !t.starred })}
          onAddSubtask={() => createMutation.mutate({ parent_id: t.id, title: 'Sous-tâche' })}
          onToAgenda={() => toAgendaMutation.mutate(t)}
          onDelete={() => deleteMutation.mutate(t.id)}
          disableActions={
            patchMutation.isPending ||
            deleteMutation.isPending ||
            createMutation.isPending ||
            toAgendaMutation.isPending
          }
          muted={muted}
        />
        {children.length > 0 ? (
          <ul className="ml-6 border-l border-slate-200 pl-3 dark:border-slate-600">
            {children.map((c) => (
              <li key={c.id} className="list-none">
                <TaskRow
                  task={c}
                  depth={1}
                  onToggle={(done) => toggleMutation.mutate({ id: c.id, completed: done })}
                  onTitleBlur={(title) => onTitleBlur(c, title)}
                  onNotesBlur={(notes) => {
                    if ((c.notes || '') === notes) return
                    patchMutation.mutate({ id: c.id, notes })
                  }}
                  onStartChange={(iso) => patchMutation.mutate({ id: c.id, start_at: iso })}
                  onDueChange={(iso) => patchMutation.mutate({ id: c.id, due_at: iso })}
                  onRepeatChange={(rule) => patchMutation.mutate({ id: c.id, repeat_rule: rule })}
                  onStarToggle={() => patchMutation.mutate({ id: c.id, starred: !c.starred })}
                  onToAgenda={() => toAgendaMutation.mutate(c)}
                  onDelete={() => deleteMutation.mutate(c.id)}
                  disableActions={
                    patchMutation.isPending || deleteMutation.isPending || toAgendaMutation.isPending
                  }
                  muted={muted || c.completed}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <ResponsivePage
      title="Tâches"
      description="Listes, sous-tâches, notes et échéances."
      action={
        <Button
          variant="secondary"
          onClick={() => {
            setSettingsDraft(tasksSettings)
            setShowTasksSettings(true)
          }}
          title="Paramètres Tâches"
          aria-label="Paramètres Tâches"
          className="!px-2.5"
        >
          <Settings className="h-4 w-4" aria-hidden />
        </Button>
      }
    >
      <div className="flex min-h-0 flex-col gap-4">
        {showTasksSettings && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tasks-settings-title"
            onClick={() => setShowTasksSettings(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="tasks-settings-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Paramètres Tâches
                </h2>
                <button
                  type="button"
                  onClick={() => setShowTasksSettings(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Fermer les paramètres Tâches"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="space-y-4 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800 dark:text-slate-200">Regrouper par échéance</span>
                  <input
                    type="checkbox"
                    checked={settingsDraft.groupByDueDate}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, groupByDueDate: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800 dark:text-slate-200">Afficher les tâches terminées</span>
                  <input
                    type="checkbox"
                    checked={settingsDraft.showCompletedSection}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({ ...prev, showCompletedSection: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setSettingsDraft(DEFAULT_TASKS_APP_SETTINGS)}>
                  Réinitialiser
                </Button>
                <Button
                  onClick={() => {
                    setTasksSettings(settingsDraft)
                    saveTasksAppSettings(settingsDraft)
                    setShowTasksSettings(false)
                    toast.success('Paramètres Tâches enregistrés')
                  }}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex min-h-[28rem] flex-col gap-4 lg:flex-row lg:items-stretch">
          <aside className="flex w-full shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900 lg:w-56">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Listes
            </p>
            <nav className="flex flex-col gap-0.5" aria-label="Listes de tâches">
              <button
                type="button"
                onClick={() => setSelectedListId(null)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  selectedListId == null
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                Toutes les tâches
              </button>
              {lists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedListId(l.id)}
                  className={`truncate rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    selectedListId === l.id
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </nav>
            <div className="mt-auto space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              <input
                type="text"
                placeholder="Nouvelle liste…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onKeyDown={(e) => e.key === 'Enter' && newListName.trim() && createListMutation.mutate()}
              />
              <Button
                variant="secondary"
                disabled={!newListName.trim() || createListMutation.isPending}
                onClick={() => createListMutation.mutate()}
                className="w-full"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Créer la liste
              </Button>
            </div>
          </aside>

          <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                type="text"
                placeholder="Titre de la tâche"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate(undefined)}
                className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setNewStarred((s) => !s)}
                className={`rounded-lg border px-2.5 py-2 ${
                  newStarred
                    ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/40'
                    : 'border-slate-200 text-slate-400 dark:border-slate-600'
                }`}
                title="Étoile / priorité"
                aria-pressed={newStarred}
              >
                <Star className={`h-4 w-4 ${newStarred ? 'fill-current' : ''}`} />
              </button>
              <Button onClick={() => createMutation.mutate(undefined)} disabled={createMutation.isPending}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                Début
                <input
                  type="datetime-local"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </label>
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
            </div>
            <textarea
              placeholder="Notes (optionnel)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
                  <ListTodo className="h-8 w-8 animate-pulse text-slate-400" />
                </div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="Aucune tâche"
                  description="Ajoutez une tâche ci-dessus pour commencer."
                />
              </div>
            ) : (
              <div className="space-y-8">
                {groupedOpen.map((group) => (
                  <section key={group.key}>
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {group.label}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {group.items.length}
                      </span>
                    </h2>
                    <ul className="space-y-1">{group.items.map((t) => renderTaskTree(t))}</ul>
                  </section>
                ))}

                {tasksSettings.showCompletedSection && completedRoots.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Terminées
                    </h2>
                    <ul className="space-y-1">{completedRoots.map((t) => renderTaskTree(t, true))}</ul>
                  </section>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </ResponsivePage>
  )
}

function TaskRow({
  task: t,
  depth,
  onToggle,
  onTitleBlur,
  onNotesBlur,
  onStartChange,
  onDueChange,
  onRepeatChange,
  onStarToggle,
  onAddSubtask,
  onToAgenda,
  onDelete,
  disableActions,
  muted,
}: {
  task: Task
  depth: number
  onToggle: (completed: boolean) => void
  onTitleBlur: (title: string) => void
  onNotesBlur: (notes: string) => void
  onStartChange: (iso: string | null) => void
  onDueChange: (iso: string | null) => void
  onRepeatChange: (rule: string | null) => void
  onStarToggle: () => void
  onAddSubtask?: () => void
  onToAgenda?: () => void
  onDelete: () => void
  disableActions?: boolean
  muted?: boolean
}) {
  const [titleDraft, setTitleDraft] = useState(t.title)
  const [notesDraft, setNotesDraft] = useState(t.notes || '')
  const [showNotes, setShowNotes] = useState(Boolean(t.notes))
  useEffect(() => {
    setTitleDraft(t.title)
  }, [t.title])
  useEffect(() => {
    setNotesDraft(t.notes || '')
    if (t.notes) setShowNotes(true)
  }, [t.notes])

  return (
    <div
      className={`group rounded-xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50/80 dark:hover:border-slate-600 dark:hover:bg-slate-800/60 ${
        muted ? 'opacity-70' : ''
      } ${depth > 0 ? 'ml-1' : ''}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {depth > 0 ? <CornerDownRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /> : null}
          <input
            type="checkbox"
            checked={t.completed}
            onChange={() => onToggle(!t.completed)}
            className="mt-1 h-4 w-4 rounded-md border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-500"
            aria-label={t.completed ? 'Marquer non terminée' : 'Marquer terminée'}
          />
          <button
            type="button"
            onClick={onStarToggle}
            disabled={disableActions}
            className={`mt-0.5 shrink-0 rounded-md p-0.5 ${
              t.starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'
            }`}
            aria-label={t.starred ? 'Retirer l’étoile' : 'Mettre en priorité'}
            aria-pressed={Boolean(t.starred)}
          >
            <Star className={`h-4 w-4 ${t.starred ? 'fill-current' : ''}`} />
          </button>
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
        <div className="flex flex-wrap items-center gap-1.5 opacity-100 sm:opacity-80 sm:group-hover:opacity-100 sm:shrink-0">
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            Début
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(t.start_at)}
              onChange={(e) => onStartChange(fromDatetimeLocalToISO(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              disabled={disableActions}
            />
          </label>
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(t.due_at)}
            onChange={(e) => onDueChange(fromDatetimeLocalToISO(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            disabled={disableActions}
            title="Échéance"
          />
          <select
            value={(t.repeat_rule as string) || ''}
            onChange={(e) => onRepeatChange(e.target.value || null)}
            className="max-w-[10rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
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
            onClick={() => setShowNotes((v) => !v)}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Notes
          </button>
          {onAddSubtask ? (
            <button
              type="button"
              onClick={onAddSubtask}
              disabled={disableActions}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
              title="Ajouter une sous-tâche"
            >
              + sous-tâche
            </button>
          ) : null}
          {onToAgenda ? (
            <button
              type="button"
              onClick={onToAgenda}
              disabled={disableActions}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
              title="Créer un événement Agenda à partir de cette tâche"
            >
              <Calendar className="h-3.5 w-3.5" />
              Agenda
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            disabled={disableActions}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
            aria-label="Supprimer la tâche"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {showNotes ? (
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => onNotesBlur(notesDraft)}
          rows={2}
          placeholder="Notes…"
          className={`mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 ${
            depth > 0 ? 'ml-2' : 'ml-8'
          }`}
          disabled={disableActions}
        />
      ) : null}
    </div>
  )
}
