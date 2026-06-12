import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Lock, Plus, Settings, X } from 'lucide-react'
import { useAuth } from '../../../authContext'
import { fetchNotes, createNote } from '../../../api'
import { AppLockedGate } from '../AppLockedGate'
import { AppLockedPinChangeSection } from '../AppLockedPinChangeSection'
import { useAppLockedVaultAutoLock } from '../useAppLockedVaultAutoLock'
import {
  APP_LOCKED_SESSION_TTL_MS,
  appLockedVaultScope,
  grantAppLockedVaultSession,
  isAppLockedVaultUnlocked,
  revokeAppLockedVaultSession,
} from '../appLockedVault'
import {
  DEFAULT_NOTES_APP_SETTINGS,
  loadNotesAppSettings,
  saveNotesAppSettings,
  type NotesAppSettings,
  type NotesSortOrder,
} from './notesAppSettings'

export default function NotesPage() {
  const { accessToken, logout, tenantId, email } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [notesSettings, setNotesSettings] = useState<NotesAppSettings>(() => loadNotesAppSettings())
  const [showNotesSettings, setShowNotesSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<NotesAppSettings>(() => loadNotesAppSettings())
  const notesVaultScope = appLockedVaultScope('notes', tenantId, email)
  const [notesVaultUnlocked, setNotesVaultUnlocked] = useState(() =>
    isAppLockedVaultUnlocked('notes', appLockedVaultScope('notes', tenantId, email))
  )
  const notesVaultRequired = notesSettings.lockEnabled
  const notesVaultReady = !notesVaultRequired || Boolean(notesVaultScope && notesVaultUnlocked)

  const { data, isLoading, error } = useQuery({
    queryKey: ['notes'],
    queryFn: () => fetchNotes(accessToken!),
    enabled: Boolean(accessToken) && notesVaultReady,
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const notes = useMemo(() => {
    const list = [...(data ?? [])]
    list.sort((a, b) => {
      const da = new Date(a.updated_at).getTime()
      const db = new Date(b.updated_at).getTime()
      return notesSettings.sortOrder === 'newest' ? db - da : da - db
    })
    return list
  }, [data, notesSettings.sortOrder])

  useEffect(() => {
    setNotesVaultUnlocked(isAppLockedVaultUnlocked('notes', notesVaultScope))
  }, [notesVaultScope, notesSettings.lockEnabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showNotesSettings) {
        e.preventDefault()
        setShowNotesSettings(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNotesSettings])

  const handleNotesVaultUnlocked = () => {
    if (!notesVaultScope) return
    grantAppLockedVaultSession('notes', notesVaultScope, APP_LOCKED_SESSION_TTL_MS)
    setNotesVaultUnlocked(true)
  }

  const lockNotesVault = useCallback(() => {
    revokeAppLockedVaultSession('notes', notesVaultScope)
    setNotesVaultUnlocked(false)
    queryClient.removeQueries({ queryKey: ['notes'] })
  }, [notesVaultScope, queryClient])

  useAppLockedVaultAutoLock(
    'notes',
    notesVaultScope,
    notesSettings.lockEnabled,
    notesVaultUnlocked,
    lockNotesVault
  )

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
    <div className="flex flex-col gap-6 min-h-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Notes</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bloc-notes et idées.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {notesVaultRequired && notesVaultUnlocked ? (
            <button
              type="button"
              onClick={lockNotesVault}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              <Lock className="h-4 w-4" aria-hidden />
              Verrouiller Notes
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSettingsDraft(notesSettings)
              setShowNotesSettings(true)
            }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
            title="Paramètres Notes"
            aria-label="Paramètres Notes"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {notesVaultRequired && notesVaultUnlocked ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Coffre Notes local ouvert</p>
              <p className="mt-1 text-blue-800/80 dark:text-blue-200/80">
                Les notes sont accessibles uniquement pendant cette session locale. Verrouillez pour masquer la liste et couper les requêtes.
              </p>
            </div>
            <button
              type="button"
              onClick={lockNotesVault}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Lock className="h-4 w-4" aria-hidden />
              Verrouiller Notes
            </button>
          </div>
        </div>
      ) : null}

      {showNotesSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notes-settings-title"
          onClick={() => setShowNotesSettings(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="notes-settings-title" className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                Paramètres Notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotesSettings(false)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-slate-800"
                aria-label="Fermer les paramètres Notes"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Tri des notes</span>
                <select
                  value={settingsDraft.sortOrder}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, sortOrder: e.target.value as NotesSortOrder }))
                  }
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="newest">Plus récentes en premier</option>
                  <option value="oldest">Plus anciennes en premier</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Aperçu du contenu</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.showContentPreview}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, showContentPreview: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Protéger Notes par coffre local</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.lockEnabled}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, lockEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              {settingsDraft.lockEnabled ? (
                <AppLockedPinChangeSection kind="notes" scope={notesVaultScope} appLabel="Notes" />
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsDraft(DEFAULT_NOTES_APP_SETTINGS)}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotesSettings(settingsDraft)
                  saveNotesAppSettings(settingsDraft)
                  setShowNotesSettings(false)
                  toast.success('Paramètres Notes enregistrés')
                }}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {notesVaultRequired && accessToken && notesVaultScope && !notesVaultUnlocked ? (
        <AppLockedGate
          kind="notes"
          scope={notesVaultScope}
          appLabel="Notes"
          description="Saisissez votre code local avant d’afficher ou créer des notes sur cet appareil."
          onUnlocked={handleNotesVaultUnlocked}
        />
      ) : null}

      {notesVaultRequired && accessToken && !notesVaultScope ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Session incomplète : reconnectez-vous pour accéder au coffre Notes.
        </p>
      ) : null}

      {notesVaultReady ? (
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm flex-1 max-w-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
          <textarea
            placeholder="Contenu"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm flex-1 max-w-md min-h-[80px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
            rows={2}
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-700 dark:hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Nouvelle note
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <FileText className="h-8 w-8 animate-pulse text-slate-400" />
              </div>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <FileText className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucune note.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Créez une note ci-dessus pour commencer.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {notes.map((n) => (
                <li key={n.id} className="py-3">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{n.title}</span>
                  {notesSettings.showContentPreview && n.content ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{n.content}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      ) : null}
    </div>
  )
}
