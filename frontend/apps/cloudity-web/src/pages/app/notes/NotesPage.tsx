import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Archive,
  Bold,
  Calendar,
  Camera,
  CheckSquare,
  FileText,
  ImagePlus,
  Italic,
  Lock,
  Pencil,
  Pin,
  Search,
  Settings,
  Trash2,
  Underline,
  X,
} from 'lucide-react'
import { useAuth } from '../../../authContext'
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  createCalendarEvent,
  type Note,
  type NoteColor,
  type NoteExtras,
  type NoteChecklistItem,
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
import {
  compressImageFile,
  emptyExtras,
  MAX_NOTE_IMAGES,
  newChecklistId,
  newImageId,
  stripHtml,
} from './noteExtras'

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
  archived: boolean
  labels: string[]
  labelInput: string
  remindAt: string | null
  extras: NoteExtras
}

const emptyDraft = (): DraftNote => ({
  title: '',
  content: '',
  color: 'default',
  pinned: false,
  archived: false,
  labels: [],
  labelInput: '',
  remindAt: null,
  extras: emptyExtras(),
})

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function draftHasContent(d: DraftNote): boolean {
  if (d.title.trim()) return true
  if (stripHtml(d.content || '').trim()) return true
  if ((d.extras.checklist ?? []).some((i) => i.text.trim() || i.done)) return true
  if ((d.extras.images ?? []).length > 0) return true
  if (d.extras.drawing) return true
  if (d.remindAt) return true
  if (d.labels.length > 0) return true
  return false
}

function noteMatchesSearch(n: Note, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if ((n.title || '').toLowerCase().includes(needle)) return true
  if (stripHtml(n.content || '').toLowerCase().includes(needle)) return true
  if ((n.labels ?? []).some((l) => l.toLowerCase().includes(needle))) return true
  if ((n.extras?.checklist ?? []).some((i) => i.text.toLowerCase().includes(needle))) return true
  return false
}

function normalizeExtras(extras?: NoteExtras | null): NoteExtras {
  return {
    checklist: [...(extras?.checklist ?? [])],
    images: [...(extras?.images ?? [])],
    drawing: extras?.drawing ?? null,
  }
}

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
  const [remindersOnly, setRemindersOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [composeMode, setComposeMode] = useState<'note' | 'list' | 'image' | 'draw'>('note')
  const notesVaultScope = appLockedVaultScope('notes', tenantId, email)
  const [notesVaultUnlocked, setNotesVaultUnlocked] = useState(() =>
    isAppLockedVaultUnlocked('notes', appLockedVaultScope('notes', tenantId, email))
  )
  const notesVaultRequired = notesSettings.lockEnabled
  const notesVaultReady = !notesVaultRequired || Boolean(notesVaultScope && notesVaultUnlocked)

  const { data, isLoading, error } = useQuery({
    queryKey: ['notes', showArchived],
    queryFn: () => fetchNotes(accessToken!, { archived: showArchived }),
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
    let list = notes
    if (labelFilter) list = list.filter((n) => (n.labels ?? []).includes(labelFilter))
    if (remindersOnly) list = list.filter((n) => Boolean(n.remind_at))
    if (searchQuery.trim()) list = list.filter((n) => noteMatchesSearch(n, searchQuery))
    return list
  }, [notes, labelFilter, remindersOnly, searchQuery])

  const pinnedNotes = useMemo(() => filteredNotes.filter((n) => n.pinned), [filteredNotes])
  const otherNotes = useMemo(() => filteredNotes.filter((n) => !n.pinned), [filteredNotes])

  useEffect(() => {
    setNotesVaultUnlocked(isAppLockedVaultUnlocked('notes', notesVaultScope))
  }, [notesVaultScope, notesSettings.lockEnabled])

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

  const draftPayload = (draft: DraftNote) => ({
    title: draft.title.trim() || 'Sans titre',
    content: draft.content,
    color: draft.color,
    pinned: draft.pinned,
    archived: draft.archived,
    labels: draft.labels,
    remind_at: draft.remindAt,
    extras: draft.extras,
  })

  const createMutation = useMutation({
    mutationFn: (draft: DraftNote) => {
      const payload = draftPayload(draft)
      if (notesVaultRequired && notesVaultScope) {
        const tempId = `new-${Date.now()}`
        const ciphertext = encryptNotePayload('notes', notesVaultScope, tempId, {
          title: payload.title,
          content: payload.content,
        })
        return createNote(accessToken!, {
          ...payload,
          content: '',
          vault_encrypted: true,
          vault_ciphertext: ciphertext,
        })
      }
      return createNote(accessToken!, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setCompose(emptyDraft())
      setComposeOpen(false)
      setComposeMode('note')
      toast.success('Note créée')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, draft, wasVault }: { id: number; draft: DraftNote; wasVault?: boolean }) => {
      const payload = draftPayload(draft)
      if ((wasVault || notesVaultRequired) && notesVaultScope) {
        const ciphertext = encryptNotePayload('notes', notesVaultScope, id, {
          title: payload.title,
          content: payload.content,
        })
        return updateNote(accessToken!, id, {
          ...payload,
          content: '',
          vault_encrypted: true,
          vault_ciphertext: ciphertext,
        })
      }
      return updateNote(accessToken!, id, {
        ...payload,
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
    mutationFn: (p: {
      id: number
    } & Partial<{
      pinned: boolean
      color: string
      labels: string[]
      archived: boolean
      extras: NoteExtras
    }>) => {
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

  const closeCompose = useCallback(
    (opts?: { discard?: boolean }) => {
      if (!opts?.discard && draftHasContent(compose) && !createMutation.isPending) {
        createMutation.mutate(compose)
        return
      }
      setComposeOpen(false)
      setCompose(emptyDraft())
      setComposeMode('note')
    },
    [compose, createMutation]
  )

  const closeEdit = useCallback(
    (opts?: { discard?: boolean }) => {
      if (!editing) {
        setEditing(null)
        return
      }
      if (!opts?.discard && draftHasContent(editDraft) && !updateMutation.isPending) {
        updateMutation.mutate({
          id: editing.id,
          draft: editDraft,
          wasVault: editing.vault_encrypted,
        })
        return
      }
      setEditing(null)
    },
    [editing, editDraft, updateMutation]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showNotesSettings) {
        e.preventDefault()
        setShowNotesSettings(false)
      } else if (editing) {
        e.preventDefault()
        closeEdit()
      } else if (composeOpen) {
        e.preventDefault()
        closeCompose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNotesSettings, editing, composeOpen, closeCompose, closeEdit])

  const openCompose = (mode: 'note' | 'list' | 'image' | 'draw' = 'note') => {
    const draft = { ...emptyDraft(), archived: showArchived }
    if (mode === 'list') {
      draft.extras = {
        ...emptyExtras(),
        checklist: [{ id: newChecklistId(), text: '', done: false }],
      }
    }
    setComposeMode(mode)
    setCompose(draft)
    setComposeOpen(true)
  }

  const openEdit = (n: Note) => {
    setEditing(n)
    setEditDraft({
      title: n.title,
      content: n.content,
      color: (n.color as NoteColor) || 'default',
      pinned: Boolean(n.pinned),
      archived: Boolean(n.archived),
      labels: [...(n.labels ?? [])],
      labelInput: '',
      remindAt: n.remind_at ?? null,
      extras: normalizeExtras(n.extras),
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

  const renderCard = (n: Note) => {
    const previewText = stripHtml(n.content || '')
    const checklist = n.extras?.checklist ?? []
    const stop = (e: React.MouseEvent) => e.stopPropagation()
    return (
      <div
        key={n.id}
        role="button"
        tabIndex={0}
        onClick={() => openEdit(n)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openEdit(n)
          }
        }}
        className={`group mb-3 w-full break-inside-avoid rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${colorClass(n.color)}`}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{n.title || 'Sans titre'}</h3>
          <div className="flex shrink-0 items-center gap-0.5">
            {n.remind_at ? (
              <span className="mr-1 text-[10px] text-slate-500" title="Rappel">
                ⏰
              </span>
            ) : null}
            {n.pinned ? <Pin className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" aria-hidden /> : null}
            <div
              className="ml-1 flex opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              onClick={stop}
            >
              <button
                type="button"
                title={n.pinned ? 'Désépingler' : 'Épingler'}
                aria-label={n.pinned ? 'Désépingler' : 'Épingler'}
                className="rounded p-1 text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-100"
                onClick={() => patchMutation.mutate({ id: n.id, pinned: !n.pinned })}
              >
                <Pin className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                title={n.archived ? 'Restaurer' : 'Archiver'}
                aria-label={n.archived ? 'Restaurer' : 'Archiver'}
                className="rounded p-1 text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-100"
                onClick={() => {
                  patchMutation.mutate({ id: n.id, archived: !n.archived })
                  toast.success(n.archived ? 'Note restaurée' : 'Note archivée')
                }}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                title="Supprimer"
                aria-label="Supprimer"
                className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => {
                  if (window.confirm('Supprimer cette note ?')) deleteMutation.mutate(n.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        {(n.extras?.images?.length ?? 0) > 0 ? (
          <img
            src={n.extras!.images![0].dataUrl}
            alt=""
            className="mb-2 max-h-32 w-full rounded-lg object-cover"
          />
        ) : n.extras?.drawing ? (
          <img src={n.extras.drawing} alt="" className="mb-2 max-h-32 w-full rounded-lg object-contain bg-white" />
        ) : null}
        {notesSettings.showContentPreview && previewText ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 line-clamp-6">{previewText}</p>
        ) : null}
        {notesSettings.showContentPreview && checklist.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
            {checklist.slice(0, 4).map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  aria-label={item.text || 'Élément de liste'}
                  className="mt-0.5"
                  onClick={stop}
                  onChange={() => {
                    const next = checklist.map((c) =>
                      c.id === item.id ? { ...c, done: !c.done } : c
                    )
                    patchMutation.mutate({
                      id: n.id,
                      extras: { ...normalizeExtras(n.extras), checklist: next },
                    })
                  }}
                />
                <span className={item.done ? 'line-through opacity-60' : ''}>{item.text || '…'}</span>
              </li>
            ))}
            {checklist.length > 4 ? (
              <li className="text-xs text-slate-500">+{checklist.length - 4}…</li>
            ) : null}
          </ul>
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
      </div>
    )
  }

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
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher dans les notes…"
                aria-label="Rechercher dans les notes"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  !showArchived
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                Actives
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  showArchived
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archives
              </button>
              <button
                type="button"
                onClick={() => setRemindersOnly((v) => !v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  remindersOnly
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                Rappels
              </button>
            </div>

            {!composeOpen ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <button
                  type="button"
                  onClick={() => openCompose('note')}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-500 shadow-sm hover:shadow dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                >
                  Prendre une note…
                </button>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Liste"
                    aria-label="Nouvelle liste"
                    onClick={() => openCompose('list')}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <CheckSquare className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Image"
                    aria-label="Nouvelle note avec image"
                    onClick={() => openCompose('image')}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Dessin"
                    aria-label="Nouveau dessin"
                    onClick={() => openCompose('draw')}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ) : (
              <NoteEditorPanel
                draft={compose}
                setDraft={setCompose}
                initialMode={composeMode}
                onClose={() => closeCompose()}
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
          onClick={() => closeEdit()}
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <NoteEditorPanel
              draft={editDraft}
              setDraft={setEditDraft}
              titleId="note-edit-title"
              onClose={() => closeEdit()}
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
              onToggleArchive={() => {
                const next = !editDraft.archived
                setEditDraft((d) => ({ ...d, archived: next }))
                patchMutation.mutate({ id: editing.id, archived: next })
                setEditing(null)
                toast.success(next ? 'Note archivée' : 'Note restaurée')
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
  onToggleArchive,
  saving,
  saveLabel,
  titleId,
  initialMode = 'note',
}: {
  draft: DraftNote
  setDraft: React.Dispatch<React.SetStateAction<DraftNote>>
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onTogglePin?: () => void
  onToggleArchive?: () => void
  saving?: boolean
  saveLabel: string
  titleId?: string
  initialMode?: 'note' | 'list' | 'image' | 'draw'
}) {
  const { accessToken } = useAuth()
  const contentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [drawingOpen, setDrawingOpen] = useState(initialMode === 'draw')
  const [checklistInput, setChecklistInput] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)

  useEffect(() => {
    if (initialMode === 'image') {
      const t = window.setTimeout(() => fileInputRef.current?.click(), 80)
      return () => window.clearTimeout(t)
    }
    if (initialMode === 'draw') setDrawingOpen(true)
  }, [initialMode])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (el.innerHTML !== draft.content) {
      el.innerHTML = draft.content || ''
    }
  }, [draft.content])

  const runFormat = (cmd: 'bold' | 'italic' | 'underline') => {
    contentRef.current?.focus()
    document.execCommand(cmd, false)
    if (contentRef.current) {
      setDraft((d) => ({ ...d, content: contentRef.current!.innerHTML }))
    }
  }

  const addLabel = () => {
    const l = draft.labelInput.trim()
    if (!l) return
    if (draft.labels.includes(l)) {
      setDraft((d) => ({ ...d, labelInput: '' }))
      return
    }
    setDraft((d) => ({ ...d, labels: [...d.labels, l], labelInput: '' }))
  }

  const updateExtras = (fn: (extras: NoteExtras) => NoteExtras) => {
    setDraft((d) => ({ ...d, extras: fn(normalizeExtras(d.extras)) }))
  }

  const addChecklistItem = () => {
    const text = checklistInput.trim()
    if (!text) return
    const item: NoteChecklistItem = { id: newChecklistId(), text, done: false }
    updateExtras((ex) => ({ ...ex, checklist: [...(ex.checklist ?? []), item] }))
    setChecklistInput('')
  }

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return
    const current = draft.extras.images ?? []
    const room = MAX_NOTE_IMAGES - current.length
    if (room <= 0) {
      toast.error(`Maximum ${MAX_NOTE_IMAGES} images`)
      return
    }
    const toAdd = Array.from(files).slice(0, room)
    try {
      const images = await Promise.all(
        toAdd.map(async (file) => ({
          id: newImageId(),
          dataUrl: await compressImageFile(file),
        }))
      )
      updateExtras((ex) => ({ ...ex, images: [...(ex.images ?? []), ...images] }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de l’ajout d’image')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const createAgendaFromNote = async () => {
    if (!accessToken) return
    const plain = stripHtml(draft.content).trim()
    const title = draft.title.trim() || plain.slice(0, 80) || 'Sans titre'
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setCreatingEvent(true)
    try {
      await createCalendarEvent(accessToken, {
        title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        description: plain ? plain.slice(0, 2000) : undefined,
      })
      toast.success('Événement créé dans Agenda')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec création événement')
    } finally {
      setCreatingEvent(false)
    }
  }

  return (
    <>
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

        <div className="mb-1 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => runFormat('bold')}
            className="rounded p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300"
            title="Gras"
            aria-label="Gras"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => runFormat('italic')}
            className="rounded p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300"
            title="Italique"
            aria-label="Italique"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => runFormat('underline')}
            className="rounded p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300"
            title="Souligné"
            aria-label="Souligné"
          >
            <Underline className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Contenu de la note"
          data-placeholder="Prendre une note…"
          onInput={() => {
            if (contentRef.current) {
              setDraft((d) => ({ ...d, content: contentRef.current!.innerHTML }))
            }
          }}
          className="min-h-[6rem] w-full resize-y overflow-auto border-0 bg-transparent text-sm text-slate-800 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] dark:text-slate-200"
        />

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            Liste
          </div>
          <ul className="space-y-1.5">
            {(draft.extras.checklist ?? []).map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() =>
                    updateExtras((ex) => ({
                      ...ex,
                      checklist: (ex.checklist ?? []).map((c) =>
                        c.id === item.id ? { ...c, done: !c.done } : c
                      ),
                    }))
                  }
                  aria-label={item.done ? `Décocher ${item.text}` : `Cocher ${item.text}`}
                />
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => {
                    const text = e.target.value
                    updateExtras((ex) => ({
                      ...ex,
                      checklist: (ex.checklist ?? []).map((c) => (c.id === item.id ? { ...c, text } : c)),
                    }))
                  }}
                  className={`min-w-0 flex-1 border-0 bg-transparent text-sm outline-none ${
                    item.done ? 'line-through opacity-60' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() =>
                    updateExtras((ex) => ({
                      ...ex,
                      checklist: (ex.checklist ?? []).filter((c) => c.id !== item.id),
                    }))
                  }
                  className="rounded p-1 text-slate-400 hover:bg-black/5 hover:text-red-600"
                  aria-label="Retirer l’élément"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              type="text"
              value={checklistInput}
              onChange={(e) => setChecklistInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
              placeholder="Ajouter un élément…"
              className="min-w-0 flex-1 rounded border border-slate-300/70 bg-white/50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900/40"
            />
            <button type="button" onClick={addChecklistItem} className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Ajouter
            </button>
          </div>
        </div>

        {(draft.extras.images?.length ?? 0) > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.extras.images!.map((img) => (
              <div key={img.id} className="relative">
                <img src={img.dataUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    updateExtras((ex) => ({
                      ...ex,
                      images: (ex.images ?? []).filter((i) => i.id !== img.id),
                    }))
                  }
                  className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-white"
                  aria-label="Retirer l’image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {draft.extras.drawing ? (
          <div className="relative mt-3 inline-block">
            <img src={draft.extras.drawing} alt="Dessin" className="max-h-40 rounded-lg border border-slate-200 bg-white" />
            <button
              type="button"
              onClick={() => updateExtras((ex) => ({ ...ex, drawing: null }))}
              className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-white"
              aria-label="Supprimer le dessin"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onPickImages(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={(draft.extras.images?.length ?? 0) >= MAX_NOTE_IMAGES}
            className="inline-flex items-center gap-1 rounded p-1.5 text-slate-600 hover:bg-black/5 disabled:opacity-40 dark:text-slate-300"
            title="Ajouter une image"
            aria-label="Ajouter une image"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled
            title="Disponible sur l’app mobile"
            aria-label="Appareil photo"
            className="inline-flex items-center gap-1 rounded p-1.5 text-slate-400 opacity-50"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDrawingOpen(true)}
            className="inline-flex items-center gap-1 rounded p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300"
            title="Dessiner"
            aria-label="Dessiner"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {onToggleArchive ? (
            <button
              type="button"
              onClick={onToggleArchive}
              className="inline-flex items-center gap-1 rounded p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300"
              title={draft.archived ? 'Désarchiver' : 'Archiver'}
              aria-label={draft.archived ? 'Désarchiver' : 'Archiver'}
            >
              <Archive className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, archived: !d.archived }))}
              className={`inline-flex items-center gap-1 rounded p-1.5 hover:bg-black/5 ${
                draft.archived ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
              }`}
              title={draft.archived ? 'Ne pas archiver' : 'Archiver à la création'}
              aria-label={draft.archived ? 'Ne pas archiver' : 'Archiver'}
              aria-pressed={draft.archived}
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
        </div>

        <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-medium">Rappel</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(draft.remindAt)}
            onChange={(e) => setDraft((d) => ({ ...d, remindAt: fromDatetimeLocal(e.target.value) }))}
            className="rounded border border-slate-300/70 bg-white/50 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900/40"
          />
        </label>

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
          <div className="flex flex-wrap items-center gap-1">
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void createAgendaFromNote()}
              disabled={creatingEvent || saving}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-black/5 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/10"
              title="Créer un événement Agenda à partir de cette note"
            >
              <Calendar className="h-4 w-4" />
              {creatingEvent ? 'Création…' : 'Vers Agenda'}
            </button>
          </div>
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

      {drawingOpen ? (
        <DrawingModal
          initialDataUrl={draft.extras.drawing}
          onClose={() => setDrawingOpen(false)}
          onSave={(dataUrl) => {
            updateExtras((ex) => ({ ...ex, drawing: dataUrl }))
            setDrawingOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function DrawingModal({
  initialDataUrl,
  onClose,
  onSave,
}: {
  initialDataUrl?: string | null
  onClose: () => void
  onSave: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = initialDataUrl
    }
  }, [initialDataUrl])

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
  }

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const end = () => {
    drawing.current = false
    last.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawing-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-600 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="drawing-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Dessin
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={560}
          height={360}
          className="w-full touch-none rounded-lg border border-slate-200 bg-white"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        <div className="mt-3 flex justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
          >
            Effacer
          </button>
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              onSave(canvas.toDataURL('image/png'))
            }}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Enregistrer le dessin
          </button>
        </div>
      </div>
    </div>
  )
}
