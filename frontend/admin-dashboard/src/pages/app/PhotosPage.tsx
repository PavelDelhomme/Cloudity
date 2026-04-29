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
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { PhotosBottomNav } from '../../components/PhotosBottomNav'
import type { PhotosTab } from './photosTypes'
import {
  deleteDriveNode,
  downloadDriveFile,
  fetchDriveNodes,
  fetchDrivePhotosTimeline,
  fetchDriveTrash,
  restoreDriveNode,
  uploadDriveFileWithProgress,
  type DriveNode,
} from '../../api'
const PAGE_SIZE = 48

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
    const iso = node.updated_at || node.created_at
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
  const m = (n.mime_type || '').toLowerCase()
  if (m.startsWith('image/')) return true
  return /\.(heic|heif|jpe?g|png|gif|webp|avif|bmp|tiff?)$/i.test(n.name)
}

function PhotoThumb({
  node,
  token,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
}: {
  node: DriveNode
  token: string
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: (n: DriveNode) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    let u: string | null = null
    downloadDriveFile(token, node.id, { inline: true })
      .then((blob) => {
        if (cancelled.current) return
        let typed = blob
        if (!blob.type || blob.type === 'application/octet-stream') {
          const lower = node.name.toLowerCase()
          if (lower.endsWith('.png')) typed = new Blob([blob], { type: 'image/png' })
          else if (lower.endsWith('.webp')) typed = new Blob([blob], { type: 'image/webp' })
          else if (lower.endsWith('.gif')) typed = new Blob([blob], { type: 'image/gif' })
          else typed = new Blob([blob], { type: 'image/jpeg' })
        }
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
  }, [token, node.id, node.name])

  return (
    <button
      type="button"
      aria-label={selectMode ? (selected ? `Désélectionner ${node.name}` : `Sélectionner ${node.name}`) : `Ouvrir ${node.name}`}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => (selectMode ? onToggleSelect() : onOpen(node))}
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
        <img src={url} alt={node.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
    downloadDriveFile(token, node.id, { inline: true })
      .then((blob) => {
        if (cancelled) return
        let typed = blob
        if (!blob.type || blob.type === 'application/octet-stream') {
          const lower = node.name.toLowerCase()
          if (lower.endsWith('.png')) typed = new Blob([blob], { type: 'image/png' })
          else if (lower.endsWith('.webp')) typed = new Blob([blob], { type: 'image/webp' })
          else if (lower.endsWith('.gif')) typed = new Blob([blob], { type: 'image/gif' })
          else typed = new Blob([blob], { type: 'image/jpeg' })
        }
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
  const { accessToken } = useAuth()
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

  const flatItems = useMemo(() => {
    const pages = photosQuery.data?.pages ?? []
    return pages.flatMap((p) => p.items)
  }, [photosQuery.data?.pages])

  const sections = useMemo(() => groupTimelineByDay(flatItems), [flatItems])

  const togglePhotoSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
      for (const file of list) {
        await new Promise<void>((resolve, reject) => {
          uploadDriveFileWithProgress(accessToken, null, file, undefined, false)
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
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'timeline'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'albums'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'album-folder'] })
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'trash-images'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Échec de la suppression'),
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
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return
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
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setFileDragActive(false)
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

  const rootFolders = useMemo(
    () => (albumsQuery.data ?? []).filter((n) => n.is_folder),
    [albumsQuery.data]
  )

  const albumImageItems = useMemo(() => {
    const raw = albumChildrenQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [albumChildrenQuery.data])

  const trashPhotoItems = useMemo(() => {
    const raw = trashQuery.data ?? []
    return raw.filter(isPhotoNode)
  }, [trashQuery.data])

  const lightboxItems = useMemo(() => {
    if (tab === 'albums' && openAlbumId != null) return albumImageItems
    if (tab === 'trash') return trashPhotoItems
    return flatItems
  }, [tab, openAlbumId, albumImageItems, trashPhotoItems, flatItems])

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
      className="relative flex flex-col gap-4 min-h-0 w-full max-w-[1600px] mx-auto pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
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
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
                {sections.map((section) => (
                  <section key={section.dayKey} aria-labelledby={`photos-day-${section.dayKey}`}>
                    <div
                      className="sticky top-0 z-10 -mx-1 mb-3 border-b border-gray-200/90 bg-gray-50/95 px-1 pb-3 pt-1 backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/92 dark:backdrop-blur-md"
                    >
                      <h2
                        id={`photos-day-${section.dayKey}`}
                        className="text-[1.35rem] font-light leading-snug tracking-tight text-gray-900 dark:text-slate-100 sm:text-2xl sm:font-extralight"
                      >
                        {section.heading}
                      </h2>
                      {section.subheading ? (
                        <p className="mt-0.5 text-sm font-normal leading-snug text-gray-600 dark:text-slate-400">
                          {section.subheading}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-0.5 sm:gap-1">
                      {section.items.map((node) => (
                        <PhotoThumb
                          key={node.id}
                          node={node}
                          token={accessToken}
                          selectMode={selectionMode}
                          selected={selectedIds.has(node.id)}
                          onToggleSelect={() => togglePhotoSelected(node.id)}
                          onOpen={openAt}
                        />
                      ))}
                    </div>
                  </section>
                ))}
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
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Regroupez vos souvenirs par album. Touchez un album pour voir les photos.
              </p>
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

      {tab === 'archive' && (
        <div className="max-w-lg space-y-4 rounded-xl border border-gray-200 bg-gray-50/90 p-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <Archive className="h-9 w-9 text-slate-400 dark:text-slate-500" aria-hidden />
          <p>
            Les photos que vous archivez apparaîtront ici. Cette vue sera enrichie dans une prochaine version.
          </p>
        </div>
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

      {tab === 'locked' && (
        <div className="max-w-lg space-y-4 rounded-xl border border-gray-200 bg-gray-50/90 p-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <Lock className="h-9 w-9 text-slate-400 dark:text-slate-500" aria-hidden />
          <p>Album verrouillé et chiffrement dédié : fonctionnalité à venir.</p>
        </div>
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

      {lightboxIndex === null ? <PhotosBottomNav currentTab={tab} onSelectTab={setTab} /> : null}
    </div>
  )
}
