import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ListTodo, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../../authContext'
import { fetchTaskLists, fetchTasks, createTask, updateTaskCompleted } from '../../api'

export default function TasksPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const { data: lists = [] } = useQuery({
    queryKey: ['tasks', 'lists'],
    queryFn: () => fetchTaskLists(accessToken!),
    enabled: Boolean(accessToken),
  })

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetchTasks(accessToken!),
    enabled: Boolean(accessToken),
  })

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

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/app" className="hover:text-slate-700">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Tasks</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Tâches</h1>
        <p className="mt-1 text-sm text-slate-500">To-do et listes.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Nouvelle tâche"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
            className="rounded border border-slate-300 px-3 py-2 text-sm flex-1 max-w-md"
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ListTodo className="h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucune tâche.</p>
              <p className="mt-1 text-sm text-slate-500">Ajoutez une tâche ci-dessus.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => toggleMutation.mutate({ id: t.id, completed: !t.completed })}
                    className="rounded border-slate-300"
                  />
                  <span className={t.completed ? 'text-slate-400 line-through' : 'text-slate-900'}>{t.title}</span>
                  {t.due_at && <span className="text-sm text-slate-500">{new Date(t.due_at).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
