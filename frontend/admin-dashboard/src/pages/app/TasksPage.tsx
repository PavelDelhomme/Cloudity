import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ListTodo, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../../authContext'
import { fetchTaskLists, fetchTasks, createTask, updateTaskCompleted } from '../../api'

export default function TasksPage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const { data: listsData } = useQuery({
    queryKey: ['tasks', 'lists'],
    queryFn: () => fetchTaskLists(accessToken!),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const lists = listsData ?? []

  const { data: tasksData, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetchTasks(accessToken!),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const tasks = tasksData ?? []

  const createMutation = useMutation({
    mutationFn: () => createTask(accessToken!, newTaskTitle || 'Nouvelle tâche'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setNewTaskTitle('')
      toast.success('Tâche créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      updateTaskCompleted(accessToken!, id, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tâches</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">To-do et listes.</p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Nouvelle tâche"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm flex-1 max-w-md text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-700 dark:hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <ListTodo className="h-8 w-8 animate-pulse text-slate-400" />
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <ListTodo className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucune tâche.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ajoutez une tâche ci-dessus pour commencer.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => toggleMutation.mutate({ id: t.id, completed: !t.completed })}
                    className="rounded border-slate-300 dark:border-slate-500"
                  />
                  <span className={t.completed ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'}>{t.title}</span>
                  {t.due_at && <span className="text-sm text-slate-500 dark:text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
