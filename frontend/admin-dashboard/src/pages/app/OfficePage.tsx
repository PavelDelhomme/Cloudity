import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FileText, Table, Presentation, FolderPlus, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import { createDriveFileWithUniqueName, fetchDriveRecentFiles } from '../../api'
import { EDITABLE_EXT, getExtension } from './DocumentEditorPage'

export default function OfficePage() {
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const { data: recentFiles = [] } = useQuery({
    queryKey: ['drive', 'recent'],
    queryFn: () => fetchDriveRecentFiles(accessToken!, 15),
    enabled: Boolean(accessToken),
  })

  const handleNewDocument = async () => {
    if (!accessToken) {
      toast.error('Non connecté')
      return
    }
    setCreating(true)
    try {
      const { id, name } = await createDriveFileWithUniqueName(accessToken, null, 'Sans titre.html')
      if (name !== 'Sans titre.html') {
        toast.success(`Un document existait déjà à ce nom. Créé sous « ${name} ».`)
      } else {
        toast.success('Document créé')
      }
      navigate(`/app/office/editor/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleNewTableur = async () => {
    if (!accessToken) {
      toast.error('Non connecté')
      return
    }
    setCreating(true)
    try {
      const { id, name } = await createDriveFileWithUniqueName(accessToken, null, 'Sans titre.csv')
      if (name !== 'Sans titre.csv') {
        toast.success(`Un tableur existait déjà à ce nom. Créé sous « ${name} ».`)
      } else {
        toast.success('Tableur créé')
      }
      navigate(`/app/office/editor/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleNewPresentation = async () => {
    if (!accessToken) {
      toast.error('Non connecté')
      return
    }
    setCreating(true)
    try {
      const { id, name } = await createDriveFileWithUniqueName(accessToken, null, 'Sans titre (présentation).html')
      if (name !== 'Sans titre (présentation).html') {
        toast.success(`Une présentation existait déjà à ce nom. Créé sous « ${name} ».`)
      } else {
        toast.success('Présentation créée')
      }
      navigate(`/app/office/editor/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">Tableau de bord</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">Office</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Suite Office</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Documents, tableurs et présentations — éditeurs maison.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/app/drive"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <FolderPlus className="h-4 w-4" />
            Nouveau dossier
          </Link>
        </div>
      </div>

      {/* Cartes colorées : Nouveau Document / Tableur / Présentation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          disabled={creating}
          onClick={handleNewDocument}
          className="group flex flex-col items-center gap-3 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 p-6 text-left hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg transition-all disabled:opacity-50"
          data-testid="office-card-document"
        >
          <div className="rounded-lg bg-blue-500 dark:bg-blue-600 p-3 text-white shadow">
            <FileText className="h-10 w-10" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">Nouveau document</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">Éditeur maison (texte riche)</span>
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={handleNewTableur}
          className="group flex flex-col items-center gap-3 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/30 p-6 text-left hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-lg transition-all disabled:opacity-50"
          data-testid="office-card-tableur"
        >
          <div className="rounded-lg bg-emerald-500 dark:bg-emerald-600 p-3 text-white shadow">
            <Table className="h-10 w-10" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">Nouveau tableur</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">Éditeur maison (.csv)</span>
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={handleNewPresentation}
          className="group flex flex-col items-center gap-3 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/50 dark:to-amber-900/30 p-6 text-left hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-lg transition-all disabled:opacity-50"
          data-testid="office-card-presentation"
        >
          <div className="rounded-lg bg-amber-500 dark:bg-amber-600 p-3 text-white shadow">
            <Presentation className="h-10 w-10" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">Nouvelle présentation</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">Éditeur maison</span>
        </button>
      </div>

      {recentFiles.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            <Clock className="h-5 w-5 text-slate-500" />
            Récemment modifiés
          </h2>
          <ul className="space-y-2">
            {recentFiles.map((node) => (
              <li key={node.id}>
                {EDITABLE_EXT.includes(getExtension(node.name)) ? (
                  <Link
                    to={`/app/office/editor/${node.id}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{node.name}</span>
                  </Link>
                ) : (
                  <Link
                    to="/app/drive"
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{node.name}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8">
        <p className="text-slate-600 dark:text-slate-300 mb-2">Utilisez les cartes ci‑dessus pour créer un document, un tableur ou une présentation.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ou ouvrir un fichier depuis le <Link to="/app/drive" className="text-brand-600 dark:text-brand-400 hover:underline">Drive</Link>.
        </p>
      </div>
    </div>
  )
}
