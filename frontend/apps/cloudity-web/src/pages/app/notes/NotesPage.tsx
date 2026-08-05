import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Lock, Pin, Settings, Trash2, X } from 'lucide-react'
import { useAuth } from '../../../authContext'
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  type Note,
  type NoteColor,
} from '../../../api'
import { clearAppVaultKey, importAppVaultKeyB64u } from '../appVaultKeySession'
import { decryptNotePayload, encryptNotePayload } from '../appVaultClient'
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

const COLOR_OPTIONS: { id: NoteColor; label: string; className: string }[] = [
  { id: 'default', label: 'Défaut', className: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600' },
  { id: 'yellow', label: 'Jaune', className: 'bg-amber-100 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800' },
  { id: 'green', label: 'Vert', className: 'bg-emerald-100 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800' },
  { id: 'blue', label: 'Bleu', className: 'bg-sky-100 border-sky-200 dark:bg-sky-950/50 dark:border-sky-800' },
  { id: 'pink', label: 'Rose', className: 'bg-pink-100 border-pink-200 dark:bg-pink-950/50 dark:border-pink-800' },
  { id: 'purple', label: 'Violet', className: 'bg-violet-100 border-violet-200 dark:bg-violet-950/50 dark:border-violet-800' },
  { id: 'orange', label: 'Orange', className: 'bg-orange-100 border-orange-200 dark:bg-orange-950/50 dark:border-orange-800' },
  { id: 'teal', label: 'Sarcelle', className: 'bg-teal-100 border-teal-200 dark:bg-teal-950/50 dark:border-teal-800' },
  { id: 'red', label: 'Rouge', className: 'bg-red-100 border-red-200 dark:bg-red-950/50 dark:border-red-800' },
  { id: 'gray', label: 'Gris', className: 'bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-500' },
]

function colorClass(color?: string | null): string {
  return COLOR_OPTIONS.find((c) => c.id === color)?.className ?? COLOR_OPTIONS[0].className
}

type DraftNote = {
  title: string
  content: string
  color: NoteColor
  pinned: boolean
  labels: string[]
  labelInput: string
}

const emptyDraft = (): DraftNote => ({
  title: '',
  content: '',
  color: 'default',
  pinned: false,
  labels: [],
  labelInput: '',
})

export default function NotesPage() {
  const { accessToken, logout, tenantId, email } = useAuth()
  const queryClient = useQueryClient()
  const [notesSettings, setNotesSettings] = useState<NotesAppSettings>(() => loadNotesAppSettings())
  const [showNotesSettings, setShowNotesSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<NotesAppSettings>(() => loadNotesAppSettings())
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState<DraftNote>(emptyDraft)
  const [editing, setEditing] = useState<Note | null>(null)
  const [editDraft, setEditDraft] = useState<DraftNote>(emptyDraft)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
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
    const list = [...(data ?? [])].map((note) => {
      if (!note.vault_encrypted || !note.vault_ciphertext || !notesVaultScope) return note
      try {
        const plain = decryptNotePayload('notes', notesVaultScope, note.id, note.vault_ciphertext)
        return { ...note, title: plain.title, content: plain.content }
      } catch {
        return { ...note, title: '🔒 Note chiffrée', content: 'Déverrouillez le coffre pour lire cette note.' }
      }
    })
    list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
      const da = new Date(a.updated_at).getTime()
      const db = new Date(b.updated_at).getTime()
      return notesSettings.sortOrder === 'newest' ? db - da : da - db
    })
    return list
  }, [data, notesSettings.sortOrder, notesVaultScope])

  const allLabels = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) {
      for (const l of n.labels ?? []) s.add(l)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [notes])

  const filteredNotes = useMemo(() => {
    if (!labelFilter) return notes
    return notes.filter((n) => (n.labels ?? []).includes(labelFilter))
  }, [notes, labelFilter])

  const pinnedNotes = useMemo(() => filteredNotes.filter((n) => n.pinned), [filteredNotes])
  const otherNotes = useMemo(() => filteredNotes.filter((n) => !n.pinned), [filteredNotes])

  useEffect(() => {
    setNotesVaultUnlocked(isAppLockedVaultUnlocked('notes', notesVaultScope))
  }, [notesVaultScope, notesSettings.lockEnabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showNotesSettings) {
        e.preventDefault()
        setShowNotesSettings(false)
      } else if (editing) {
        e.preventDefault()
        setEditing(null)
      } else if (composeOpen) {
        e.preventDefault()
        setComposeOpen(false)
        setCompose(emptyDraft())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNotesSettings, editing, composeOpen])

  const handleNotesVaultUnlocked = (vaultKeyB64u?: string) => {
    if (!notesVaultScope) return
    grantAppLockedVaultSession('notes', notesVaultScope, APP_LOCKED_SESSION_TTL_MS, vaultKeyB64u)
    if (vaultKeyB64u) importAppVaultKeyB64u('notes', notesVaultScope, vaultKeyB64u)
    setNotesVaultUnlocked(true)
  }

  const lockNotesVault = useCallback(() => {
    clearAppVaultKey('notes', notesVaultScope)
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
    mutationFn: (draft: DraftNote) => {
      const noteTitle = draft.title.trim() || 'Sans titre'
      const content = draft.content
      if (notesVaultRequired && notesVaultScope) {
        const tempId = `new-${Date.now()}`
        const ciphertext = encryptNotePayload('notes', notesVaultScope, tempId, {
          title: noteTitle,
          content,
        })
        return createNote(accessToken!, {
          title: noteTitle,
          content: '',
          color: draft.color,
          pinned: draft.pinned,
          labels: draft.labels,
          vault_encrypted: true,
          vault_ciphertext: ciphertext,
        })
      }
      return createNote(accessToken!, {
        title: noteTitle,
        content,
        color: draft.color,
        pinned: draft.pinned,
        labels: draft.labels,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setCompose(emptyDraft())
      setComposeOpen(false)
      toast.success('Note créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, draft, wasVault }: { id: number; draft: DraftNote; wasVault?: boolean }) => {
      const noteTitle = draft.title.trim() || 'Sans titre'
      if ((wasVault || notesVaultRequired) && notesVaultScope) {
        const ciphertext = encryptNotePayload('notes', notesVaultScope, id, {
          title: noteTitle,
          content: draft.content,
        })
        return updateNote(accessToken!, id, {
          title: noteTitle,
          content: '',
          color: draft.color,
          pinned: draft.pinned,
          labels: draft.labels,
          vault_encrypted: true,
          vault_ciphertext: ciphertext,
        })
      }
      return updateNote(accessToken!, id, {
        title: noteTitle,
        content: draft.content,
        color: draft.color,
        pinned: draft.pinned,
        labels: draft.labels,
        vault_encrypted: false,
        vault_ciphertext: '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setEditing(null)
      toast.success('Note enregistrée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const patchMutation = useMutation({
    mutationFn: (p: { id: number } & Partial<{ pinned: boolean; color: string; labels: string[] }>) => {
      const { id, ...rest } = p
      return updateNote(accessToken!, id, rest)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteNote(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setEditing(null)
      toast.success('Note supprimée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const openEdit = (n: Note) => {
    setEditing(n)
    setEditDraft({
      title: n.title,
      content: n.content,
      color: (n.color as NoteColor) || 'default',
      pinned: Boolean(n.pinned),
      labels: [...(n.labels ?? [])],
      labelInput: '',
    })
  }

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

  const renderCard = (n: Note) => (
    <button
      key={n.id}
      type="button"
      onClick={() => openEdit(n)}
      className={`mb-3 w-full break-inside-avoid rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md ${colorClass(n.color)}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{n.title || 'Sans titre'}</h3>
        {n.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden /> : null}
      </div>
      {notesSettings.showContentPreview && n.content ? (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 line-clamp-6">{n.content}</p>
      ) : null}
      {(n.labels ?? []).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {n.labels!.map((l) => (
            <span
              key={l}
              className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              {l}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Notes</h1>
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
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
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
                Les notes sont accessibles uniquement pendant cette session locale. Verrouillez pour masquer la liste et
                couper les requêtes.
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
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
                <AppLockedPinChangeSection
                  kind="notes"
                  scope={notesVaultScope}
                  appLabel="Notes"
                  accessToken={accessToken}
                />
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
        <>
          <div className="mx-auto w-full max-w-2xl">
            {!composeOpen ? (
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-500 shadow-sm hover:shadow dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                Prendre une note…
              </button>
            ) : (
              <NoteEditorPanel
                draft={compose}
                setDraft={setCompose}
                onClose={() => {
                  setComposeOpen(false)
                  setCompose(emptyDraft())
                }}
                onSave={() => createMutation.mutate(compose)}
                saving={createMutation.isPending}
                saveLabel="Créer"
              />
            )}
          </div>

          {allLabels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLabelFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  labelFilter == null
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                Tous
              </button>
              {allLabels.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabelFilter(l)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    labelFilter === l
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
                <FileText className="h-8 w-8 animate-pulse text-slate-400" />
              </div>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-700">
                <FileText className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucune note.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Créez une note ci-dessus pour commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {pinnedNotes.length > 0 ? (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Épinglées</h2>
                  <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
                    {pinnedNotes.map(renderCard)}
                  </div>
                </section>
              ) : null}
              {otherNotes.length > 0 ? (
                <section>
                  {pinnedNotes.length > 0 ? (
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Autres</h2>
                  ) : null}
                  <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
                    {otherNotes.map(renderCard)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-edit-title"
          onClick={() => setEditing(null)}
        >
          <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <NoteEditorPanel
              draft={editDraft}
              setDraft={setEditDraft}
              titleId="note-edit-title"
              onClose={() => setEditing(null)}
              onSave={() =>
                updateMutation.mutate({
                  id: editing.id,
                  draft: editDraft,
                  wasVault: editing.vault_encrypted,
                })
              }
              onDelete={() => deleteMutation.mutate(editing.id)}
              onTogglePin={() => {
                const next = !editDraft.pinned
                setEditDraft((d) => ({ ...d, pinned: next }))
                patchMutation.mutate({ id: editing.id, pinned: next })
              }}
              saving={updateMutation.isPending || deleteMutation.isPending}
              saveLabel="Enregistrer"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NoteEditorPanel({
  draft,
  setDraft,
  onClose,
  onSave,
  onDelete,
  onTogglePin,
  saving,
  saveLabel,
  titleId,
}: {
  draft: DraftNote
  setDraft: React.Dispatch<React.SetStateAction<DraftNote>>
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onTogglePin?: () => void
  saving?: boolean
  saveLabel: string
  titleId?: string
}) {
  const addLabel = () => {
    const l = draft.labelInput.trim()
    if (!l) return
    if (draft.labels.includes(l)) {
      setDraft((d) => ({ ...d, labelInput: '' }))
      return
    }
    setDraft((d) => ({ ...d, labels: [...d.labels, l], labelInput: '' }))
  }

  return (
    <div className={`rounded-xl border p-4 shadow-xl ${colorClass(draft.color)}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          id={titleId}
          type="text"
          placeholder="Titre"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="w-full border-0 bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        <div className="flex shrink-0 items-center gap-1">
          {onTogglePin ? (
            <button
              type="button"
              onClick={onTogglePin}
              className={`rounded p-1.5 ${draft.pinned ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}
              aria-label={draft.pinned ? 'Désépingler' : 'Épingler'}
              aria-pressed={draft.pinned}
            >
              <Pin className={`h-4 w-4 ${draft.pinned ? 'fill-current' : ''}`} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, pinned: !d.pinned }))}
              className={`rounded p-1.5 ${draft.pinned ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}
              aria-label={draft.pinned ? 'Désépingler' : 'Épingler'}
              aria-pressed={draft.pinned}
            >
              <Pin className={`h-4 w-4 ${draft.pinned ? 'fill-current' : ''}`} />
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-black/5" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <textarea
        placeholder="Prendre une note…"
        value={draft.content}
        onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
        rows={6}
        className="w-full resize-y border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {COLOR_OPTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => setDraft((d) => ({ ...d, color: c.id }))}
            className={`h-6 w-6 rounded-full border ${c.className} ${
              draft.color === c.id ? 'ring-2 ring-slate-700 ring-offset-1 dark:ring-slate-200' : ''
            }`}
            aria-label={`Couleur ${c.label}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {draft.labels.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, labels: d.labels.filter((x) => x !== l) }))}
            className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10"
            title="Retirer le libellé"
          >
            {l} ×
          </button>
        ))}
        <input
          type="text"
          placeholder="Libellé…"
          value={draft.labelInput}
          onChange={(e) => setDraft((d) => ({ ...d, labelInput: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
          className="min-w-[7rem] flex-1 rounded border border-slate-300/70 bg-white/50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900/40"
        />
        <button type="button" onClick={addLabel} className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Ajouter
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
