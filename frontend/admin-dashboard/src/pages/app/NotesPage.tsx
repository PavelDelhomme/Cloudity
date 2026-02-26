import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../../authContext'
import { fetchNotes, createNote } from '../../api'

export default function NotesPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => fetchNotes(accessToken!),
    enabled: Boolean(accessToken),
  })

  const createMutation = useMutation({
    mutationFn: () => createNote(accessToken!, title || 'Sans titre', content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setTitle('')
      setContent('')
      toast.success('Note créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/app" className="hover:text-slate-700">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Notes</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Notes</h1>
        <p className="mt-1 text-sm text-slate-500">Bloc-notes et idées.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm flex-1 max-w-xs"
          />
          <textarea
            placeholder="Contenu"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm flex-1 max-w-md min-h-[80px]"
            rows={2}
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Nouvelle note
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucune note.</p>
              <p className="mt-1 text-sm text-slate-500">Créez une note ci-dessus.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="py-3">
                  <span className="font-medium text-slate-900">{n.title}</span>
                  {n.content && <p className="mt-1 text-sm text-slate-600 line-clamp-2">{n.content}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
