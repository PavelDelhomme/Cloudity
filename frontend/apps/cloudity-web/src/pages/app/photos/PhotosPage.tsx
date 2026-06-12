import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
  X,
  FolderOpen,
  Archive,
  Trash2,
  Lock,
  Check,
  ChevronLeft,
  RotateCcw,
  Plus,
  Settings,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../authContext'
import { PhotosBottomNav } from '../../../components/PhotosBottomNav'
import type { PhotosTab } from './photosTypes'
import {
  archiveDrivePhotos,
  createDriveFolder,
  deleteDriveNode,
  downloadDriveFile,
  downloadDriveThumbnail,
  fetchDriveNodes,
  fetchDrivePhotosArchive,
  fetchDrivePhotosLocked,
  fetchDrivePhotosTimeline,
  fetchDriveTrash,
  lockDrivePhotos,
  putDriveNodeContentBlob,
  restoreDriveNode,
  unarchiveDrivePhotos,
  unlockDrivePhotos,
  uploadDriveFileWithProgress,
  type DriveNode,
} from '../../../api'
import { APP_VAULT_MIME, decryptDriveFileBlob, encryptDriveFileBytes } from '../appVaultClient'
import { clearAppVaultKey, getAppVaultKey, importAppVaultKeyB64u } from '../appVaultKeySession'
import {
  DEFAULT_PHOTOS_APP_SETTINGS,
  loadPhotosAppSettings,
  photosGridClassName,
  savePhotosAppSettings,
  type PhotosAppSettings,
  type PhotosGridSize,
} from './photosAppSettings'
import { PhotosLockedGate } from './PhotosLockedGate'
import {
  changePhotosLockedPin,
  grantPhotosLockedVaultSession,
  isPhotosLockedVaultUnlocked,
  photosLockedVaultScope,
  PHOTOS_LOCKED_SESSION_TTL_MS,
  revokePhotosLockedVaultSession,
} from './photosLockedVault'
const PAGE_SIZE = 48
const PHOTO_DOWNLOAD_CONCURRENCY = 6

let activePhotoDownloads = 0
const pendingPhotoDownloads: Array<() => void> = []

function schedulePhotoDownload<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activePhotoDownloads += 1
      job()
        .then(resolve, reject)
        .finally(() => {
          activePhotoDownloads = Math.max(0, activePhotoDownloads - 1)
          pendingPhotoDownloads.shift()?.()
        })
    }
    if (activePhotoDownloads < PHOTO_DOWNLOAD_CONCURRENCY) run()
    else pendingPhotoDownloads.push(run)
  })
}

const VALID_PHOTOS_TABS: readonly PhotosTab[] = ['timeline', 'albums', 'archive', 'trash', 'locked']

const SECTION_LABELS: Record<Exclude<PhotosTab, 'timeline'>, string> = {
  albums: 'Albums',
  archive: 'Archivé',
  trash: 'Corbeille',
  locked: 'Verrouillé',
}

function localDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Libellés section chronologie (référence type Google Photos : titre lisible + ligne secondaire optionnelle). */
function daySectionLabels(iso: string): { primary: string; sub?: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { primary: 'Date inconnue' }
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startToday - startD) / (24 * 60 * 60 * 1000))

  const ligneCalendaire = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)

  if (diffDays === 0) return { primary: 'Aujourd’hui', sub: ligneCalendaire }
  if (diffDays === 1) return { primary: 'Hier', sub: ligneCalendaire }

  if (diffDays >= 2 && diffDays < 7) {
    const primary = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    }).format(d)
    return { primary, sub: undefined }
  }

  const primary = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
  const sub = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d)
  return { primary, sub }
}

function groupTimelineByDay(
  items: DriveNode[]
): { heading: string; subheading?: string; dayKey: string; items: DriveNode[] }[] {
  const out: { heading: string; subheading?: string; dayKey: string; items: DriveNode[] }[] = []
  for (const node of items) {
    const iso = node.taken_at || node.created_at || node.updated_at
    const dayKey = localDayKey(iso)
    const { primary, sub } = daySectionLabels(iso)
    const last = out[out.length - 1]
    if (last && last.dayKey === dayKey) last.items.push(node)
    else out.push({ dayKey, heading: primary, subheading: sub, items: [node] })
  }
  return out
}

function isImageFile(f: File): boolean {
  if (f.type.startsWith('image/')) return true
  return /\.(heic|heif|jpe?g|png|gif|webp|avif|bmp|tiff?)$/i.test(f.name)
}

function isPhotoNode(n: DriveNode): boolean {
  if (n.is_folder) return false
  const lower = n.name.toLowerCase()
  if (lower.endsWith('.pdf')) return false
  const m = (n.mime_type || '').toLowerCase()
  if (m.includes('pdf')) return false
  if (m.startsWith('image/')) return true
  return /\.(heic|heif|jpe?g|png|gif|webp|avif|bmp|tiff?)$/i.test(n.name)
}

function isExternalFileDrag(dataTransfer: DataTransfer | null): boolean {
  const types = [...(dataTransfer?.types ?? [])]
  if (!types.includes('Files')) return false
  // Un drag interne navigateur peut exposer un blob/fichier avec du HTML ou une URL.
  // On réserve l'upload aux vrais fichiers venant de l'OS.
  return !types.some((t) => t === 'text/html' || t === 'text/uri-list' || t === 'text/plain')
}

function typedImageBlob(blob: Blob, fileName: string): Blob {
  if (blob.type && blob.type !== 'application/octet-stream') return blob
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return new Blob([blob], { type: 'image/png' })
  if (lower.endsWith('.webp')) return new Blob([blob], { type: 'image/webp' })
  if (lower.endsWith('.gif')) return new Blob([blob], { type: 'image/gif' })
  if (lower.endsWith('.heic')) return new Blob([blob], { type: 'image/heic' })
  if (lower.endsWith('.heif')) return new Blob([blob], { type: 'image/heif' })
  if (lower.endsWith('.avif')) return new Blob([blob], { type: 'image/avif' })
  if (lower.endsWith('.bmp')) return new Blob([blob], { type: 'image/bmp' })
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return new Blob([blob], { type: 'image/tiff' })
  return new Blob([blob], { type: 'image/jpeg' })
}

function PhotoThumb({
  node,
  token,
  vaultScope,
  selectMode,
  selected,
  onToggleSelect,
  onContextMenuPhoto,
  onOpen,
}: {
  node: DriveNode
  token: string
  vaultScope?: string | null
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onContextMenuPhoto?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onOpen: (n: DriveNode) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    let u: string | null = null
    const load = async (): Promise<Blob> => {
      if (node.vault_encrypted && vaultScope) {
        const enc = await downloadDriveFile(token, node.id)
        const { bytes, mime } = await decryptDriveFileBlob(
          'photos',
          vaultScope,
          node.id,
          await enc.arrayBuffer()
        )
        return new Blob([bytes], { type: mime })
      }
      return downloadDriveThumbnail(token, node.id, 360)
    }
    schedulePhotoDownload(load)
      .then((blob) => {
        if (cancelled.current) return
        const typed = typedImageBlob(blob, node.name)
        u = URL.createObjectURL(typed)
        setUrl(u)
      })
      .catch(() => {
        if (!cancelled.current) setErr(true)
      })
    return () => {
      cancelled.current = true
      if (u) URL.revokeObjectURL(u)
    }
  }, [token, node.id, node.name, node.vault_encrypted, vaultScope])

  return (
    <button
      type="button"
      data-photo-thumb="true"
      draggable={false}
      aria-label={selectMode ? (selected ? `Désélectionner ${node.name}` : `Sélectionner ${node.name}`) : `Ouvrir ${node.name}`}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => (selectMode ? onToggleSelect() : onOpen(node))}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={
        onContextMenuPhoto
          ? (e) => {
              e.preventDefault()
              onContextMenuPhoto(e)
            }
          : undefined
      }
      className={`relative aspect-square rounded-sm overflow-hidden bg-neutral-200/90 dark:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 transition-opacity ${
        selected ? 'ring-2 ring-blue-500 ring-inset dark:ring-blue-400' : 'hover:opacity-95'
      }`}
    >
      {selectMode && (
        <span
          className={`absolute top-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${
            selected
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-white/90 bg-black/25 text-transparent'
          }`}
          aria-hidden
        >
          {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
        </span>
      )}
      {err ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 p-1 text-center">
          Échec du chargement
        </span>
      ) : url ? (
        <img
          src={url}
          alt={node.name}
          draggable={false}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setErr(true)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
        </span>
      )}
    </button>
  )
}

function Lightbox({
  node,
  token,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  node: DriveNode
  token: string
  onClose: () => void
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let u: string | null = null
    setLoading(true)
    setUrl(null)
    schedulePhotoDownload(() => downloadDriveFile(token, node.id, { inline: true }))
      .then((blob) => {
        if (cancelled) return
        const typed = typedImageBlob(blob, node.name)
        u = URL.createObjectURL(typed)
        setUrl(u)
      })
      .catch(() => {
        if (!cancelled) toast.error('Impossible de charger l’image')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (u) URL.revokeObjectURL(u)
    }
  }, [token, node.id, node.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/88 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu photo"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 text-white shrink-0 mb-2">
        <p className="text-sm truncate flex-1 min-w-0" title={node.name}>
          {node.name}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0 relative">
        {loading && (
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()} aria-hidden>
            <Loader2 className="h-10 w-10 animate-spin text-white/70" />
          </div>
        )}
        {url && !loading && (
          <img
            src={url}
            alt={node.name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-md shadow-2xl cursor-default"
          />
        )}
        {hasPrev && (
          <button
            type="button"
            aria-label="Photo précédente"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label="Photo suivante"
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}

export default function PhotosPage() {
  const { accessToken, tenantId, email } = useAuth()
  const lockedVaultScope = photosLockedVaultScope(tenantId, email)
  const [lockedVaultUnlocked, setLockedVaultUnlocked] = useState(() =>
    isPhotosLockedVaultUnlocked(photosLockedVaultScope(tenantId, email))
  )
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabRaw = (searchParams.get('tab') ?? 'timeline').toLowerCase()
  const tab: PhotosTab = (VALID_PHOTOS_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as PhotosTab) : 'timeline'
  const [fileDragActive, setFileDragActive] = useState(false)
  /** Sélection multiple (chronologie) — alignement PHOTOS.md §3. */
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [showPhotosSettings, setShowPhotosSettings] = useState(false)
  const [photosSettings, setPhotosSettings] = useState<PhotosAppSettings>(() => loadPhotosAppSettings())
  const [settingsDraft, setSettingsDraft] = useState<PhotosAppSettings>(() => loadPhotosAppSettings())
  const [pinChangeCurrent, setPinChangeCurrent] = useState('')
  const [pinChangeNext, setPinChangeNext] = useState('')
  const [pinChangeConfirm, setPinChangeConfirm] = useState('')
  const [pinChangeBusy, setPinChangeBusy] = useState(false)
  const [pinChangeError, setPinChangeError] = useState<string | null>(null)
  const [photoContextMenu, setPhotoContextMenu] = useState<{ x: number; y: number; node: DriveNode } | null>(null)

  const setTab = useCallback(
    (next: PhotosTab) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('album')
          if (next === 'timeline') n.delete('tab')
          else n.set('tab', next)
          return n
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const photosQuery = useInfiniteQuery({
    queryKey: ['drive', 'photos', 'timeline'],
    queryFn: ({ pageParam }) =>
      fetchDrivePhotosTimeline(accessToken!, { limit: PAGE_SIZE, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.offset + lastPage.limit : undefined),
    enabled: !!accessToken && tab === 'timeline',
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const albumsQuery = useQuery({
    queryKey: ['drive', 'photos', 'albums', 'root-folders'],
    queryFn: () => fetchDriveNodes(accessToken!, null),
    enabled: Boolean(accessToken) && tab === 'albums',
    staleTime: 60_000,
  })

  const albumParamRaw = searchParams.get('album')
  const openAlbumId =
    albumParamRaw && /^\d+$/.test(albumParamRaw) ? Number.parseInt(albumParamRaw, 10) : null

  const albumChildrenQuery = useQuery({
    queryKey: ['drive', 'photos', 'album-folder', openAlbumId],
    queryFn: () => fetchDriveNodes(accessToken!, openAlbumId!),
    enabled: Boolean(accessToken) && tab === 'albums' && openAlbumId != null,
    staleTime: 30_000,
  })

  const trashQuery = useQuery({
    queryKey: ['drive', 'photos', 'trash-images'],
    queryFn: () => fetchDriveTrash(accessToken!),
    enabled: Boolean(accessToken) && tab === 'trash',
    staleTime: 30_000,
  })

  const archiveQuery = useQuery({
    queryKey: ['drive', 'photos', 'archive'],
    queryFn: () => fetchDrivePhotosArchive(accessToken!),
    enabled: Boolean(accessToken) && tab === 'archive',
    staleTime: 30_000,
  })

  const lockedQuery = useQuery({
    queryKey: ['drive', 'photos', 'locked'],
    queryFn: () => fetchDrivePhotosLocked(accessToken!),
    enabled: Boolean(accessToken) && tab === 'locked' && lockedVaultUnlocked,
    staleTime: 30_000,
  })

  const flatItems = useMemo(() => {
    const pages = photosQuery.data?.pages ?? []
    return pages.flatMap((p) => p.items ?? [])
  }, [photosQuery.data?.pages])

  const sections = useMemo(() => groupTimelineByDay(flatItems), [flatItems])
  const allVisibleSelected = flatItems.length > 0 && selectedIds.size >= flatItems.length

  const togglePhotoSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const openPhotoContextMenu = useCallback((node: DriveNode, event: React.MouseEvent<HTMLButtonElement>) => {
    setSelectionMode(true)
    setSelectedIds((prev) => {
      if (prev.has(node.id)) return prev
      const next = new Set(prev)
      next.add(node.id)
      return next
    })
    setPhotoContextMenu({ x: event.clientX, y: event.clientY, node })
  }, [])

  const closePhotoContextMenu = useCallback(() => setPhotoContextMenu(null), [])

  const toggleSectionSelection = useCallback((items: DriveNode[]) => {
    if (!items.length) return
    const ids = items.map((n) => n.id)
    setSelectionMode(true)
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const selectAllVisiblePhotos = useCallback(() => {
    setSelectedIds(new Set(flatItems.map((n) => n.id)))
  }, [flatItems])

  const clearPhotoSelection = useCallback(() => setSelectedIds(new Set()), [])

  const exitPhotoSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  useEffect(() => {
    if (tab !== 'timeline') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (lightboxIndex !== null) return
      if (photoContextMenu) {
        e.preventDefault()
        closePhotoContextMenu()
        return
      }
      if (showPhotosSettings) {
        e.preventDefault()
        setShowPhotosSettings(false)
        return
      }
      if (selectionMode) {
        e.preventDefault()
        exitPhotoSelectionMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    tab,
    lightboxIndex,
    photoContextMenu,
    showPhotosSettings,
    selectionMode,
    closePhotoContextMenu,
    exitPhotoSelectionMode,
  ])

  useEffect(() => {
    setLockedVaultUnlocked(isPhotosLockedVaultUnlocked(lockedVaultScope))
  }, [lockedVaultScope])

  useEffect(() => {
    if (tab === 'locked') return
    if (lockedVaultScope) revokePhotosLockedVaultSession(lockedVaultScope)
    setLockedVaultUnlocked(false)
  }, [tab, lockedVaultScope])

  useEffect(() => {
    if (tab !== 'locked' || !lockedVaultScope || !lockedVaultUnlocked) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        revokePhotosLockedVaultSession(lockedVaultScope)
        setLockedVaultUnlocked(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tab, lockedVaultScope, lockedVaultUnlocked])

  const handleLockedVaultUnlocked = useCallback((vaultKeyB64u?: string) => {
    if (!lockedVaultScope) return
    grantPhotosLockedVaultSession(lockedVaultScope, PHOTOS_LOCKED_SESSION_TTL_MS, vaultKeyB64u)
    if (vaultKeyB64u) importAppVaultKeyB64u('photos', lockedVaultScope, vaultKeyB64u)
    setLockedVaultUnlocked(true)
  }, [lockedVaultScope])

  const lockLockedVault = useCallback(() => {
    if (!lockedVaultScope) return
    clearAppVaultKey('photos', lockedVaultScope)
    revokePhotosLockedVaultSession(lockedVaultScope)
    setLockedVaultUnlocked(false)
    setLightboxIndex(null)
    void queryClient.removeQueries({ queryKey: ['drive', 'photos', 'locked'] })
  }, [lockedVaultScope, queryClient])

  const handleChangeLockedPin = useCallback(async () => {
    if (!lockedVaultScope) {
      setPinChangeError('Session incomplète : reconnectez-vous avant de changer le code.')
      return
    }
    setPinChangeBusy(true)
    setPinChangeError(null)
    try {
      const result = await changePhotosLockedPin(
        lockedVaultScope,
        pinChangeCurrent,
        pinChangeNext,
        pinChangeConfirm
      )
      if (!result.ok) {
        setPinChangeError(result.error)
        return
      }
      setPinChangeCurrent('')
      setPinChangeNext('')
      setPinChangeConfirm('')
      toast.success('Code du coffre Photos mis à jour')
    } finally {
      setPinChangeBusy(false)
    }
  }, [lockedVaultScope, pinChangeConfirm, pinChangeCurrent, pinChangeNext])

  useEffect(() => {
    if (tab !== 'timeline') {
      setSelectionMode(false)
      setSelectedIds(new Set())
    }
  }, [tab])

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      if (!accessToken) throw new Error('Non connecté')
      const list = Array.from(files).filter(isImageFile)
      if (!list.length) throw new Error('Aucun fichier image dans la sélection')
      const rootNodes = await fetchDriveNodes(accessToken, null)
      const photosFolder =
        rootNodes.find((n) => n.is_folder && n.name.trim().toLowerCase() === 'photos') ??
        (await createDriveFolder(accessToken, null, 'Photos'))
      for (const file of list) {
        await new Promise<void>((resolve, reject) => {
          uploadDriveFileWithProgress(accessToken, photosFolder.id, file, undefined, false)
            .then(() => resolve())
            .catch(reject)
        })
      }
    },
    onSuccess: (_, vars) => {
      const n = Array.from(vars as FileList | File[]).filter(isImageFile).length
      toast.success(n > 1 ? `${n} photos téléversées` : 'Téléversement terminé')
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'timeline'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'albums'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'album-folder'] })
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Échec du téléversement')
    },
  })

  const invalidatePhotoLibraryQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'timeline'] })
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'archive'] })
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'locked'] })
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'albums'] })
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'album-folder'] })
    void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'trash-images'] })
  }, [queryClient])

  const deletePhotosMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!accessToken) throw new Error('Non connecté')
      for (const id of ids) {
        await deleteDriveNode(accessToken, id)
      }
    },
    onSuccess: (_, ids) => {
      toast.success(
        ids.length > 1 ? `${ids.length} photos déplacées vers la corbeille` : 'Photo déplacée vers la corbeille'
      )
      setLightboxIndex(null)
      exitPhotoSelectionMode()
      invalidatePhotoLibraryQueries()
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de la suppression'),
  })

  const archivePhotosMutation = useMutation({
    mutationFn: (ids: number[]) => {
      if (!accessToken) throw new Error('Non connecté')
      return archiveDrivePhotos(accessToken, ids)
    },
    onSuccess: (res, ids) => {
      const n = res.updated || ids.length
      toast.success(n > 1 ? `${n} photos archivées` : 'Photo archivée')
      setLightboxIndex(null)
      exitPhotoSelectionMode()
      invalidatePhotoLibraryQueries()
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de l’archivage'),
  })

  const unarchivePhotosMutation = useMutation({
    mutationFn: (ids: number[]) => {
      if (!accessToken) throw new Error('Non connecté')
      return unarchiveDrivePhotos(accessToken, ids)
    },
    onSuccess: (res, ids) => {
      const n = res.updated || ids.length
      toast.success(n > 1 ? `${n} photos restaurées` : 'Photo restaurée')
      setLightboxIndex(null)
      invalidatePhotoLibraryQueries()
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de la restauration'),
  })

  const encryptPhotosForLock = useCallback(
    async (ids: number[]) => {
      if (!accessToken || !lockedVaultScope) throw new Error('Non connecté')
      if (!getAppVaultKey('photos', lockedVaultScope)) {
        throw new Error('Déverrouillez le coffre avec votre code pour chiffrer les photos.')
      }
      for (const id of ids) {
        const blob = await downloadDriveFile(accessToken, id)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const node =
          flatItems.find((n) => n.id === id) ??
          (archiveQuery.data ?? []).find((n) => n.id === id) ??
          (lockedQuery.data ?? []).find((n) => n.id === id)
        const mime = node?.mime_type || blob.type || 'application/octet-stream'
        const name = node?.name || `photo-${id}`
        const encrypted = encryptDriveFileBytes('photos', lockedVaultScope, id, bytes, mime, name)
        await putDriveNodeContentBlob(accessToken, id, encrypted, APP_VAULT_MIME)
      }
    },
    [accessToken, lockedVaultScope, flatItems, archiveQuery.data, lockedQuery.data]
  )

  const lockPhotosMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (!accessToken) throw new Error('Non connecté')
      await encryptPhotosForLock(ids)
      return lockDrivePhotos(accessToken, ids)
    },
    onSuccess: (res, ids) => {
      const n = res.updated || ids.length
      toast.success(n > 1 ? `${n} photos verrouillées` : 'Photo verrouillée')
      setLightboxIndex(null)
      exitPhotoSelectionMode()
      invalidatePhotoLibraryQueries()
    },
    onError: (e: Error) => toast.error(e.message || 'Échec du verrouillage'),
  })

  const unlockPhotosMutation = useMutation({
    mutationFn: (ids: number[]) => {
      if (!accessToken) throw new Error('Non connecté')
      return unlockDrivePhotos(accessToken, ids)
    },
    onSuccess: (res, ids) => {
      const n = res.updated || ids.length
      toast.success(n > 1 ? `${n} photos déverrouillées` : 'Photo déverrouillée')
      setLightboxIndex(null)
      invalidatePhotoLibraryQueries()
    },
    onError: (e: Error) => toast.error(e.message || 'Échec du déverrouillage'),
  })

  const restoreTrashPhotoMutation = useMutation({
    mutationFn: (id: number) => {
      if (!accessToken) throw new Error('Non connecté')
      return restoreDriveNode(accessToken, id)
    },
    onSuccess: () => {
      toast.success('Photo restaurée')
      setLightboxIndex(null)
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'trash-images'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'timeline'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de la restauration'),
  })

  const onPickFiles = useCallback(() => fileInputRef.current?.click(), [])

  const onFilesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      e.target.value = ''
      if (files && files.length) uploadMutation.mutate(files)
    },
    [uploadMutation]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isExternalFileDrag(e.dataTransfer)) return
    setFileDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isExternalFileDrag(e.dataTransfer)) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setFileDragActive(false)
      if (!isExternalFileDrag(e.dataTransfer)) return
      const files = e.dataTransfer?.files
      if (!files?.length || tab !== 'timeline') return
      const imgs = Array.from(files).filter(isImageFile)
      if (!imgs.length) {
        toast.error('Déposez uniquement des fichiers image')
        return
      }
      const dt = new DataTransfer()
      imgs.forEach((f) => dt.items.add(f))
      uploadMutation.mutate(dt.files)
    },
    [uploadMutation, tab]
  )

  const [newAlbumOpen, setNewAlbumOpen] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')

  const rootFolders = useMemo(
    () =>
      (albumsQuery.data ?? []).filter(
        (n) => n.is_folder && n.name.trim().toLowerCase() !== 'photos',
      ),
    [albumsQuery.data],
  )

  const createAlbumMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!accessToken) throw new Error('Non connecté')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Nom d’album requis')
      return createDriveFolder(accessToken, null, trimmed)
    },
    onSuccess: (folder) => {
      toast.success(`Album « ${folder.name} » créé`)
      setNewAlbumOpen(false)
      setNewAlbumName('')
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'albums'] })
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('tab', 'albums')
          n.set('album', String(folder.id))
          return n
        },
        { replace: true },
      )
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de la création'),
  })

  const albumImageItems = useMemo(() => {
    const raw = albumChildrenQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [albumChildrenQuery.data])

  const trashPhotoItems = useMemo(() => {
    const raw = trashQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [trashQuery.data])

  const archivePhotoItems = useMemo(() => {
    const raw = archiveQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [archiveQuery.data])

  const lockedPhotoItems = useMemo(() => {
    const raw = lockedQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [lockedQuery.data])

  const timelineGridClass = photosGridClassName(photosSettings.gridSize)

  const confirmBulkPhotoAction = useCallback(
    (message: string) => !photosSettings.confirmArchiveLock || window.confirm(message),
    [photosSettings.confirmArchiveLock]
  )

  const runArchiveSelected = useCallback(() => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirmBulkPhotoAction(`Archiver ${ids.length} photo${ids.length > 1 ? 's' : ''} ?`)) return
    archivePhotosMutation.mutate(ids)
  }, [archivePhotosMutation, confirmBulkPhotoAction, selectedIds])

  const runArchiveOne = useCallback(
    (node: DriveNode) => {
      closePhotoContextMenu()
      if (!confirmBulkPhotoAction(`Archiver « ${node.name} » ?`)) return
      archivePhotosMutation.mutate([node.id])
    },
    [archivePhotosMutation, closePhotoContextMenu, confirmBulkPhotoAction]
  )

  const runLockSelected = useCallback(() => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (
      !confirmBulkPhotoAction(
        `Verrouiller ${ids.length} photo${ids.length > 1 ? 's' : ''} ? Elles quitteront la bibliothèque principale.`
      )
    ) {
      return
    }
    lockPhotosMutation.mutate(ids)
  }, [confirmBulkPhotoAction, lockPhotosMutation, selectedIds])

  const runLockOne = useCallback(
    (node: DriveNode) => {
      closePhotoContextMenu()
      if (!confirmBulkPhotoAction(`Verrouiller « ${node.name} » ? Elle quittera la bibliothèque principale.`)) return
      lockPhotosMutation.mutate([node.id])
    },
    [closePhotoContextMenu, confirmBulkPhotoAction, lockPhotosMutation]
  )

  const runDeleteOne = useCallback(
    (node: DriveNode) => {
      closePhotoContextMenu()
      deletePhotosMutation.mutate([node.id])
    },
    [closePhotoContextMenu, deletePhotosMutation]
  )

  const lightboxItems = useMemo(() => {
    if (tab === 'albums' && openAlbumId != null) return albumImageItems
    if (tab === 'trash') return trashPhotoItems
    if (tab === 'archive') return archivePhotoItems
    if (tab === 'locked') return lockedPhotoItems
    return flatItems
  }, [tab, openAlbumId, albumImageItems, trashPhotoItems, archivePhotoItems, lockedPhotoItems, flatItems])

  const openAt = useCallback(
    (node: DriveNode) => {
      const i = lightboxItems.findIndex((n) => n.id === node.id)
      setLightboxIndex(i >= 0 ? i : 0)
    },
    [lightboxItems]
  )

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const lightboxNode =
    lightboxIndex !== null && lightboxItems[lightboxIndex] ? lightboxItems[lightboxIndex] : null

  const openAlbumName = useMemo(() => {
    if (openAlbumId == null) return null
    const fromRoot = rootFolders.find((f) => f.id === openAlbumId)
    return fromRoot?.name ?? `Album ${openAlbumId}`
  }, [openAlbumId, rootFolders])

  useEffect(() => {
    setLightboxIndex(null)
  }, [openAlbumId, tab])

  const closeAlbumFolder = useCallback(() => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('album')
        if (!n.get('tab')) n.set('tab', 'albums')
        return n
      },
      { replace: true }
    )
  }, [setSearchParams])

  return (
    <div
      className="relative flex flex-col gap-4 min-h-0 w-full max-w-[1600px] mx-auto rounded-2xl bg-white/70 text-neutral-900 dark:bg-transparent dark:text-slate-100 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
      onDragEnter={tab === 'timeline' ? handleDragEnter : undefined}
      onDragLeave={tab === 'timeline' ? handleDragLeave : undefined}
      onDragOver={tab === 'timeline' ? handleDragOver : undefined}
      onDrop={tab === 'timeline' ? handleDrop : undefined}
    >
      {fileDragActive && tab === 'timeline' && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500/80 bg-neutral-950/40 dark:bg-black/50 backdrop-blur-[2px] pointer-events-none"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-2 text-center px-6 text-white">
            <Upload className="h-12 w-12 opacity-90" aria-hidden />
            <p className="text-lg font-medium">Relâchez pour importer</p>
            <p className="text-sm text-white/80">Vos photos seront ajoutées à la bibliothèque</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 min-h-10">
        <div className="min-w-0 flex-1">
          {tab !== 'timeline' ? (
            <div className="flex min-w-0 items-center gap-2">
              {tab === 'albums' && openAlbumId != null ? (
                <button
                  type="button"
                  onClick={closeAlbumFolder}
                  className="inline-flex shrink-0 items-center justify-center rounded-full p-2 text-neutral-600 hover:bg-neutral-200/80 dark:text-neutral-300 dark:hover:bg-white/10"
                  aria-label="Retour à la liste des albums"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
              <h1 className="truncate text-xl font-normal text-neutral-900 dark:text-neutral-100 tracking-tight">
                {tab === 'albums' && openAlbumId != null && openAlbumName
                  ? openAlbumName
                  : SECTION_LABELS[tab]}
              </h1>
            </div>
          ) : null}
        </div>
        {accessToken ? (
          <button
            type="button"
            onClick={() => {
              setSettingsDraft(photosSettings)
              setShowPhotosSettings(true)
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-full p-2.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-700"
            title="Paramètres Photos"
            aria-label="Paramètres Photos"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
        {tab === 'timeline' && accessToken ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={onFilesChange}
            />
            <button
              type="button"
              onClick={() => void photosQuery.refetch()}
              disabled={photosQuery.isFetching || !accessToken}
              className="inline-flex items-center justify-center rounded-full p-2.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-700 disabled:opacity-40"
              title="Actualiser"
              aria-label="Actualiser la galerie"
            >
              <RefreshCw className={`h-5 w-5 ${photosQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            {flatItems.length > 0 && !selectionMode ? (
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-neutral-700"
              >
                Sélectionner
              </button>
            ) : null}
            {flatItems.length > 0 && selectionMode ? (
              <button
                type="button"
                onClick={exitPhotoSelectionMode}
                className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-neutral-700"
              >
                Terminer
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPickFiles}
              disabled={!accessToken || uploadMutation.isPending}
              className="inline-flex items-center justify-center rounded-full p-2.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              title="Importer"
              aria-label="Importer des photos"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
        ) : null}
      </div>

      {!accessToken && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Connectez-vous pour voir vos photos.</p>
      )}

      {tab === 'timeline' && (
        <>
          {photosQuery.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {(photosQuery.error as Error)?.message || 'Erreur de chargement'}
            </p>
          )}

          {photosQuery.isPending && accessToken && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            </div>
          )}

          {accessToken && !photosQuery.isPending && flatItems.length === 0 && !photosQuery.isError && (
            <div className="flex flex-col items-center justify-center text-center py-16 px-4 min-h-[200px] text-neutral-500 dark:text-neutral-400">
              <ImageIcon className="h-16 w-16 mb-4 opacity-40" aria-hidden />
              <p className="text-base text-neutral-800 dark:text-neutral-200 mb-1">Aucune photo</p>
              <p className="text-sm mb-6 max-w-sm">Importez ou glissez-déposez des images ici.</p>
              <button
                type="button"
                onClick={onPickFiles}
                className="rounded-full bg-blue-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-blue-700"
              >
                Importer
              </button>
            </div>
          )}

          {flatItems.length > 0 && accessToken && (
            <>
              {selectionMode ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-700">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={selectAllVisiblePhotos}
                    disabled={allVisibleSelected}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    onClick={clearPhotoSelection}
                    disabled={selectedIds.size === 0}
                    className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:underline disabled:opacity-40"
                  >
                    Tout désélectionner
                  </button>
                  <button
                    type="button"
                    onClick={runArchiveSelected}
                    disabled={selectedIds.size === 0 || archivePhotosMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                    aria-label="Archiver la sélection"
                  >
                    {archivePhotosMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    ) : (
                      <Archive className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Archiver
                  </button>
                  <button
                    type="button"
                    onClick={runLockSelected}
                    disabled={selectedIds.size === 0 || lockPhotosMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                    aria-label="Verrouiller la sélection"
                  >
                    {lockPhotosMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Verrouiller
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = [...selectedIds]
                      if (ids.length) deletePhotosMutation.mutate(ids)
                    }}
                    disabled={selectedIds.size === 0 || deletePhotosMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                    aria-label="Mettre à la corbeille"
                  >
                    {deletePhotosMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Corbeille
                  </button>
                </div>
              ) : null}
              <div className="flex flex-col gap-8 sm:gap-10">
                {photosSettings.showDateSections
                  ? sections.map((section) => (
                      <section key={section.dayKey} aria-labelledby={`photos-day-${section.dayKey}`}>
                        <div className="sticky top-0 z-10 mb-3 py-2">
                          <div className="inline-flex max-w-full items-start gap-3 rounded-2xl border border-black/5 bg-white/80 px-3.5 py-2 shadow-sm shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                            <div className="min-w-0 flex-1">
                              <h2
                                id={`photos-day-${section.dayKey}`}
                                className="truncate text-[1.2rem] font-normal leading-tight tracking-tight text-gray-950 dark:text-slate-50 sm:text-xl"
                              >
                                {section.heading}
                              </h2>
                              {section.subheading ? (
                                <p className="mt-0.5 truncate text-xs font-normal leading-snug text-gray-600 dark:text-slate-400 sm:text-sm">
                                  {section.subheading}
                                </p>
                              ) : null}
                            </div>
                            {(() => {
                              const sectionSelected =
                                section.items.length > 0 && section.items.every((node) => selectedIds.has(node.id))
                              const sectionPartiallySelected =
                                !sectionSelected && section.items.some((node) => selectedIds.has(node.id))
                              return (
                                <button
                                  type="button"
                                  onClick={() => toggleSectionSelection(section.items)}
                                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                    sectionSelected
                                      ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500'
                                      : sectionPartiallySelected
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                                        : 'border-neutral-300 bg-white/80 text-neutral-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-300'
                                  }`}
                                  aria-label={
                                    sectionSelected
                                      ? `Désélectionner ${section.heading}`
                                      : `Sélectionner ${section.heading}`
                                  }
                                  aria-pressed={sectionSelected}
                                  title={sectionSelected ? 'Désélectionner cette date' : 'Sélectionner cette date'}
                                >
                                  <Check className="h-4 w-4" aria-hidden strokeWidth={sectionSelected ? 3 : 2} />
                                </button>
                              )
                            })()}
                          </div>
                        </div>
                        <div className={`grid ${timelineGridClass} gap-0.5 sm:gap-1`}>
                          {section.items.map((node) => (
                            <PhotoThumb
                              key={node.id}
                              node={node}
                              token={accessToken}
                              selectMode={selectionMode}
                              selected={selectedIds.has(node.id)}
                              onToggleSelect={() => togglePhotoSelected(node.id)}
                              onContextMenuPhoto={(event) => openPhotoContextMenu(node, event)}
                              onOpen={openAt}
                            />
                          ))}
                        </div>
                      </section>
                    ))
                  : (
                      <div className={`grid ${timelineGridClass} gap-0.5 sm:gap-1`}>
                        {flatItems.map((node) => (
                          <PhotoThumb
                            key={node.id}
                            node={node}
                            token={accessToken}
                            selectMode={selectionMode}
                            selected={selectedIds.has(node.id)}
                            onToggleSelect={() => togglePhotoSelected(node.id)}
                            onContextMenuPhoto={(event) => openPhotoContextMenu(node, event)}
                            onOpen={openAt}
                          />
                        ))}
                      </div>
                    )}
              </div>
              {photosQuery.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => void photosQuery.fetchNextPage()}
                    disabled={photosQuery.isFetchingNextPage}
                    className="rounded-full border border-neutral-300 dark:border-neutral-600 px-5 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {photosQuery.isFetchingNextPage ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                      </span>
                    ) : (
                      'Charger plus'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'albums' && accessToken && (
        <div className="space-y-4">
          {openAlbumId != null ? (
            <>
              {albumChildrenQuery.isPending ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                </div>
              ) : albumChildrenQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(albumChildrenQuery.error as Error).message}
                </p>
              ) : albumImageItems.length === 0 ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Aucune photo dans cet album pour l’instant.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-0.5 sm:gap-1">
                  {albumImageItems.map((node) => (
                    <PhotoThumb
                      key={node.id}
                      node={node}
                      token={accessToken}
                      selectMode={false}
                      selected={false}
                      onToggleSelect={() => {}}
                      onOpen={openAt}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Regroupez vos souvenirs par album. Touchez un album pour voir les photos.
                </p>
                <button
                  type="button"
                  onClick={() => setNewAlbumOpen(true)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Nouvel album
                </button>
              </div>
              {newAlbumOpen && (
                <form
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-neutral-50/90 p-4 dark:border-slate-600 dark:bg-slate-800/50"
                  onSubmit={(e) => {
                    e.preventDefault()
                    createAlbumMutation.mutate(newAlbumName)
                  }}
                >
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
                    Nom de l’album
                    <input
                      type="text"
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                      placeholder="Vacances 2026"
                      autoFocus
                      maxLength={120}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createAlbumMutation.isPending || !newAlbumName.trim()}
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {createAlbumMutation.isPending ? 'Création…' : 'Créer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewAlbumOpen(false)
                        setNewAlbumName('')
                      }}
                      className="rounded-full border border-neutral-300 px-4 py-2 text-sm dark:border-slate-600"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
              {albumsQuery.isPending ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                </div>
              ) : albumsQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{(albumsQuery.error as Error).message}</p>
              ) : rootFolders.length === 0 ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Aucun album pour l’instant.</p>
              ) : (
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rootFolders.map((f) => (
                    <li key={f.id}>
                      <Link
                        to={`/app/photos?tab=albums&album=${f.id}`}
                        className="group flex items-center gap-3 rounded-xl border border-neutral-200/90 bg-white p-4 shadow-sm transition-all hover:border-blue-300/80 hover:shadow-md dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] dark:hover:border-slate-500 dark:hover:from-slate-800 dark:hover:to-slate-900"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          <FolderOpen className="h-6 w-6" aria-hidden />
                        </span>
                        <div className="min-w-0 text-left">
                          <p className="font-medium text-neutral-900 dark:text-slate-100 truncate">{f.name}</p>
                          <p className="text-xs text-neutral-500 dark:text-slate-400">Voir les photos</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'archive' && accessToken && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Photos retirées de la chronologie principale. Restaurez-les pour les revoir dans la bibliothèque.
          </p>
          {archiveQuery.isPending ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : archiveQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{(archiveQuery.error as Error).message}</p>
          ) : archivePhotoItems.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              <Archive className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
              <p>Aucune photo archivée.</p>
            </div>
          ) : (
            <div className={`grid ${timelineGridClass} gap-2 sm:gap-3`}>
              {archivePhotoItems.map((node) => (
                <div key={node.id} className="flex flex-col items-stretch gap-1.5">
                  <PhotoThumb
                    node={node}
                    token={accessToken}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onOpen={openAt}
                  />
                  <button
                    type="button"
                    onClick={() => unarchivePhotosMutation.mutate([node.id])}
                    disabled={unarchivePhotosMutation.isPending}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Restaurer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'archive' && !accessToken && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Connectez-vous pour voir les photos archivées.</p>
      )}

      {tab === 'trash' && accessToken && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Photos supprimées depuis la bibliothèque. Vous pouvez les restaurer ici ; les autres fichiers restent
            visibles dans la corbeille Drive.
          </p>
          {trashQuery.isPending ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : trashQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{(trashQuery.error as Error).message}</p>
          ) : trashPhotoItems.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              <Trash2 className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
              <p>Aucune photo dans la corbeille.</p>
              <Link
                to="/app/drive?view=trash"
                className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Ouvrir la corbeille Drive complète
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                {trashPhotoItems.map((node) => (
                  <div key={node.id} className="flex flex-col items-stretch gap-1.5">
                    <PhotoThumb
                      node={node}
                      token={accessToken}
                      selectMode={false}
                      selected={false}
                      onToggleSelect={() => {}}
                      onOpen={openAt}
                    />
                    <button
                      type="button"
                      onClick={() => restoreTrashPhotoMutation.mutate(node.id)}
                      disabled={restoreTrashPhotoMutation.isPending}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Restaurer
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500 dark:text-slate-500">
                <Link to="/app/drive?view=trash" className="text-blue-600 hover:underline dark:text-blue-400">
                  Corbeille Drive (tous les fichiers)
                </Link>
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'trash' && !accessToken && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Connectez-vous pour voir la corbeille photos.</p>
      )}

      {tab === 'locked' && accessToken && lockedVaultScope && !lockedVaultUnlocked && (
        <PhotosLockedGate scope={lockedVaultScope} onUnlocked={handleLockedVaultUnlocked} />
      )}

      {tab === 'locked' && accessToken && lockedVaultUnlocked && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Photos masquées de la chronologie et de l’archive. Session locale active ({Math.round(PHOTOS_LOCKED_SESSION_TTL_MS / 60_000)} min max).
            </p>
            <button
              type="button"
              onClick={lockLockedVault}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Verrouiller le coffre
            </button>
          </div>
          {lockedQuery.isPending ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : lockedQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{(lockedQuery.error as Error).message}</p>
          ) : lockedPhotoItems.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              <Lock className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
              <p>Aucune photo verrouillée.</p>
            </div>
          ) : (
            <div className={`grid ${timelineGridClass} gap-2 sm:gap-3`}>
              {lockedPhotoItems.map((node) => (
                <div key={node.id} className="flex flex-col items-stretch gap-1.5">
                  <PhotoThumb
                    node={node}
                    token={accessToken}
                    vaultScope={lockedVaultScope}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onOpen={openAt}
                  />
                  <button
                    type="button"
                    onClick={() => unlockPhotosMutation.mutate([node.id])}
                    disabled={unlockPhotosMutation.isPending}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Déverrouiller
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'locked' && !accessToken && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Connectez-vous pour voir les photos verrouillées.</p>
      )}

      {tab === 'locked' && accessToken && !lockedVaultScope && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Session incomplète : reconnectez-vous pour accéder au coffre verrouillé.
        </p>
      )}

      {lightboxNode && accessToken && lightboxIndex !== null && (
        <Lightbox
          node={lightboxNode}
          token={accessToken}
          onClose={closeLightbox}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < lightboxItems.length - 1}
          onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() =>
            setLightboxIndex((i) => (i !== null && i < lightboxItems.length - 1 ? i + 1 : i))
          }
        />
      )}

      {showPhotosSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photos-settings-title"
          onClick={() => setShowPhotosSettings(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="photos-settings-title" className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                Paramètres Photos
              </h2>
              <button
                type="button"
                onClick={() => setShowPhotosSettings(false)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-slate-800"
                aria-label="Fermer les paramètres Photos"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Taille de la grille</span>
                <select
                  value={settingsDraft.gridSize}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, gridSize: e.target.value as PhotosGridSize }))
                  }
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="compact">Compacte</option>
                  <option value="normal">Normale</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Afficher les dates</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.showDateSections}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, showDateSections: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">
                  Confirmer archive et verrouillage
                </span>
                <input
                  type="checkbox"
                  checked={settingsDraft.confirmArchiveLock}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, confirmArchiveLock: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
                  Changer le code du coffre verrouillé
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                  Le nouveau code reste local à ce navigateur.
                </p>
                <div className="mt-3 grid gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-neutral-800 dark:text-slate-200">Code actuel</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={pinChangeCurrent}
                      onChange={(e) => setPinChangeCurrent(e.target.value)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                      aria-label="Code actuel"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-neutral-800 dark:text-slate-200">Nouveau code</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={pinChangeNext}
                      onChange={(e) => setPinChangeNext(e.target.value)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                      aria-label="Nouveau code"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-neutral-800 dark:text-slate-200">Confirmer le nouveau code</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={pinChangeConfirm}
                      onChange={(e) => setPinChangeConfirm(e.target.value)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                      aria-label="Confirmer le nouveau code"
                    />
                  </label>
                </div>
                {pinChangeError ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {pinChangeError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={pinChangeBusy}
                  onClick={() => void handleChangeLockedPin()}
                  className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Changer le code PIN
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSettingsDraft(DEFAULT_PHOTOS_APP_SETTINGS)
                }}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhotosSettings(settingsDraft)
                  savePhotosAppSettings(settingsDraft)
                  setShowPhotosSettings(false)
                  toast.success('Paramètres Photos enregistrés')
                }}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {photoContextMenu ? (
        <>
          <button
            type="button"
            aria-label="Fermer le menu contextuel Photos"
            className="fixed inset-0 z-[55] cursor-default bg-transparent"
            onClick={closePhotoContextMenu}
          />
          <div
            role="menu"
            aria-label={`Actions pour ${photoContextMenu.node.name}`}
            className="fixed z-[56] min-w-52 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-1.5 text-sm text-neutral-800 shadow-xl shadow-black/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            style={{
              left: Math.min(photoContextMenu.x, Math.max(16, window.innerWidth - 240)),
              top: Math.min(photoContextMenu.y, Math.max(16, window.innerHeight - 230)),
            }}
          >
            <div className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">
              <p className="truncate font-medium text-neutral-700 dark:text-slate-200" title={photoContextMenu.node.name}>
                {photoContextMenu.node.name}
              </p>
              <p>Actions rapides</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                togglePhotoSelected(photoContextMenu.node.id)
                closePhotoContextMenu()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-slate-800"
            >
              <Check className="h-4 w-4" aria-hidden />
              {selectedIds.has(photoContextMenu.node.id) ? 'Désélectionner' : 'Sélectionner'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runArchiveOne(photoContextMenu.node)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-slate-800"
            >
              <Archive className="h-4 w-4" aria-hidden />
              Archiver
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runLockOne(photoContextMenu.node)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-slate-800"
            >
              <Lock className="h-4 w-4" aria-hidden />
              Verrouiller
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runDeleteOne(photoContextMenu.node)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Mettre à la corbeille
            </button>
          </div>
        </>
      ) : null}

      {lightboxIndex === null ? <PhotosBottomNav currentTab={tab} onSelectTab={setTab} /> : null}
    </div>
  )
}
