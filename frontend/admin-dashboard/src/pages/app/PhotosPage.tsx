import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
  X,
  CalendarDays,
  FolderOpen,
  Archive,
  Trash2,
  Lock,
  Cloud,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../authContext'
import {
  downloadDriveFile,
  fetchDriveNodes,
  fetchDrivePhotosTimeline,
  uploadDriveFileWithProgress,
  type DriveNode,
} from '../../api'
import { formatRelativeDate } from '../../utils/formatDate'

const PAGE_SIZE = 48

export type PhotosTab = 'timeline' | 'albums' | 'archive' | 'trash' | 'locked'

function localDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatPhotosDayHeading(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Date inconnue'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startToday - startD) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Aujourd’hui'
  if (diffDays === 1) return 'Hier'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d)
}

function groupTimelineByDay(items: DriveNode[]): { heading: string; dayKey: string; items: DriveNode[] }[] {
  const out: { heading: string; dayKey: string; items: DriveNode[] }[] = []
  for (const node of items) {
    const iso = node.updated_at || node.created_at
    const dayKey = localDayKey(iso)
    const last = out[out.length - 1]
    if (last && last.dayKey === dayKey) last.items.push(node)
    else out.push({ dayKey, heading: formatPhotosDayHeading(iso), items: [node] })
  }
  return out
}

function isImageFile(f: File): boolean {
  if (f.type.startsWith('image/')) return true
  return /\.(heic|heif|jpe?g|png|gif|webp|avif|bmp|tiff?)$/i.test(f.name)
}

function PhotoThumb({
  node,
  token,
  onOpen,
}: {
  node: DriveNode
  token: string
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
      aria-label={`Ouvrir ${node.name}`}
      onClick={() => onOpen(node)}
      className="relative aspect-square rounded-md overflow-hidden ring-1 ring-slate-200/80 dark:ring-slate-600/80 bg-slate-100 dark:bg-slate-900 shadow-sm hover:shadow-md hover:ring-2 hover:ring-brand-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-shadow"
    >
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
        {loading && <Loader2 className="h-10 w-10 animate-spin text-white/70" aria-hidden />}
        {url && !loading && (
          <img
            src={url}
            alt={node.name}
            className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-md shadow-2xl"
          />
        )}
        {hasPrev && (
          <button
            type="button"
            aria-label="Photo précédente"
            onClick={onPrev}
            className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label="Photo suivante"
            onClick={onNext}
            className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
          >
            ›
          </button>
        )}
      </div>
      <p className="text-center text-xs text-white/60 mt-2 shrink-0">
        Stockage Drive — organisez depuis{' '}
        <Link to="/app/drive" className="underline hover:text-white">
          Drive
        </Link>
        .
      </p>
    </div>
  )
}

const TAB_ITEMS: { id: PhotosTab; label: string; icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Chronologie', icon: CalendarDays },
  { id: 'albums', label: 'Albums', icon: FolderOpen },
  { id: 'archive', label: 'Archivé', icon: Archive },
  { id: 'trash', label: 'Corbeille', icon: Trash2 },
  { id: 'locked', label: 'Verrouillé', icon: Lock },
]

export default function PhotosPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabRaw = (searchParams.get('tab') ?? 'timeline').toLowerCase()
  const tab: PhotosTab = TAB_ITEMS.some((t) => t.id === tabRaw) ? (tabRaw as PhotosTab) : 'timeline'
  const [fileDragActive, setFileDragActive] = useState(false)

  const setTab = useCallback(
    (next: PhotosTab) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
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

  const flatItems = useMemo(() => {
    const pages = photosQuery.data?.pages ?? []
    return pages.flatMap((p) => p.items)
  }, [photosQuery.data?.pages])

  const sections = useMemo(() => groupTimelineByDay(flatItems), [flatItems])

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
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Échec du téléversement')
    },
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

  const openAt = useCallback((node: DriveNode) => {
    const i = flatItems.findIndex((n) => n.id === node.id)
    setLightboxIndex(i >= 0 ? i : 0)
  }, [flatItems])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const lightboxNode =
    lightboxIndex !== null && flatItems[lightboxIndex] ? flatItems[lightboxIndex] : null

  const lastSynced =
    photosQuery.dataUpdatedAt > 0 ? formatRelativeDate(new Date(photosQuery.dataUpdatedAt).toISOString()) : '—'

  const rootFolders = useMemo(
    () => (albumsQuery.data ?? []).filter((n) => n.is_folder),
    [albumsQuery.data]
  )

  return (
    <div
      className="relative flex flex-col gap-5 min-h-0 rounded-2xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950/80 p-1 sm:p-4 border border-slate-200/80 dark:border-slate-700/80"
      onDragEnter={tab === 'timeline' ? handleDragEnter : undefined}
      onDragLeave={tab === 'timeline' ? handleDragLeave : undefined}
      onDragOver={tab === 'timeline' ? handleDragOver : undefined}
      onDrop={tab === 'timeline' ? handleDrop : undefined}
    >
      {fileDragActive && tab === 'timeline' && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-500/10 dark:bg-brand-600/20 backdrop-blur-[2px] pointer-events-none"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-2 text-center px-6">
            <Upload className="h-14 w-14 text-brand-600 dark:text-brand-300" />
            <p className="text-lg font-semibold text-brand-900 dark:text-brand-100">Déposez vos photos ici</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Elles seront ajoutées à la racine du Drive</p>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Photos</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Bibliothèque Cloudity : chronologie par jour (comme Google Photos), glisser-déposer pour importer. Les
            images du Drive apparaissent ici automatiquement.
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-600 bg-white/90 dark:bg-slate-800/90 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
            title="Dernière mise à jour des données affichées"
          >
            <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>
              Synchro :{' '}
              {photosQuery.isFetching ? (
                <span className="text-brand-600 dark:text-brand-400">mise à jour…</span>
              ) : (
                <span>{tab === 'timeline' ? lastSynced : '—'}</span>
              )}
            </span>
          </div>
          {tab === 'timeline' && (
            <div className="flex flex-wrap items-center gap-2">
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
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${photosQuery.isFetching ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
              <button
                type="button"
                onClick={onPickFiles}
                disabled={!accessToken || uploadMutation.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium shadow-md disabled:opacity-50"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Importer
              </button>
            </div>
          )}
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-600/60"
        aria-label="Navigation Photos"
      >
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-200 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              {label}
            </button>
          )
        })}
      </nav>

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

          {photosQuery.isLoading && accessToken && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            </div>
          )}

          {accessToken && !photosQuery.isLoading && flatItems.length === 0 && !photosQuery.isError && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/40 p-10 flex flex-col items-center justify-center text-center min-h-[220px]">
              <ImageIcon className="h-14 w-14 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">Aucune photo pour l’instant</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                Glissez-déposez des images depuis votre ordinateur sur cette page, ou utilisez le bouton Importer.
              </p>
              <button
                type="button"
                onClick={onPickFiles}
                className="rounded-full bg-brand-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-brand-700"
              >
                Choisir des fichiers
              </button>
            </div>
          )}

          {flatItems.length > 0 && accessToken && (
            <>
              <div className="flex flex-col gap-10">
                {sections.map((section) => (
                  <section key={section.dayKey} aria-labelledby={`photos-day-${section.dayKey}`}>
                    <h2
                      id={`photos-day-${section.dayKey}`}
                      className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50/95 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-600/80"
                    >
                      {section.heading}
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1 sm:gap-1.5">
                      {section.items.map((node) => (
                        <PhotoThumb key={node.id} node={node} token={accessToken} onOpen={openAt} />
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
                    className="rounded-full border border-slate-200 dark:border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
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
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Les <strong>albums</strong> correspondent ici aux <strong>dossiers</strong> à la racine de votre Drive.
            Ajoutez des images dans un dossier pour constituer un album ; la chronologie globale reste sous «
            Chronologie ».
          </p>
          {albumsQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : albumsQuery.isError ? (
            <p className="text-sm text-red-600">{(albumsQuery.error as Error).message}</p>
          ) : rootFolders.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun dossier à la racine. Créez un dossier depuis le Drive.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rootFolders.map((f) => (
                <li key={f.id}>
                  <Link
                    to="/app/drive"
                    state={{
                      breadcrumb: [
                        { id: null, name: 'Drive' },
                        { id: f.id, name: f.name },
                      ],
                    }}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 hover:border-brand-400 hover:shadow-md transition-all"
                  >
                    <FolderOpen className="h-10 w-10 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{f.name}</p>
                      <p className="text-xs text-slate-500">Ouvrir dans Drive</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'archive' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <Archive className="h-10 w-10 text-slate-400" />
          <p className="font-medium text-slate-900 dark:text-slate-100">Archivé (photos uniquement)</p>
          <p>
            Pour retirer des images de la chronologie principale sans les supprimer, créez un dossier{' '}
            <strong>« Archive »</strong> (ou similaire) dans le Drive et déplacez-y vos fichiers. Une vue dédiée
            «&nbsp;archivé&nbsp;» côté API arrivera plus tard (alignement Google Photos).
          </p>
          <Link
            to="/app/drive"
            className="inline-flex text-brand-600 dark:text-brand-400 font-medium hover:underline"
          >
            Ouvrir le Drive
          </Link>
        </div>
      )}

      {tab === 'trash' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <Trash2 className="h-10 w-10 text-red-400" />
          <p className="font-medium text-slate-900 dark:text-slate-100">Corbeille photos</p>
          <p>
            Les photos supprimées depuis le Drive ou l’éditeur se retrouvent dans la <strong>corbeille Drive</strong>.
            Vous pouvez restaurer ou supprimer définitivement depuis cette vue.
          </p>
          <Link
            to="/app/drive?view=trash"
            className="inline-flex rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Ouvrir la corbeille Drive
          </Link>
        </div>
      )}

      {tab === 'locked' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <Lock className="h-10 w-10 text-slate-400" />
          <p className="font-medium text-slate-900 dark:text-slate-100">Dossier verrouillé</p>
          <p>
            Espace dédié aux photos sensibles (chiffrement / biométrie) — prévu dans la roadmap sécurité (**TR-01**).
            Pour l’instant, utilisez le coffre <strong>Pass</strong> pour les secrets et gardez les photos standard
            dans la chronologie.
          </p>
        </div>
      )}

      {lightboxNode && accessToken && lightboxIndex !== null && (
        <Lightbox
          node={lightboxNode}
          token={accessToken}
          onClose={closeLightbox}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < flatItems.length - 1}
          onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() =>
            setLightboxIndex((i) => (i !== null && i < flatItems.length - 1 ? i + 1 : i))
          }
        />
      )}
    </div>
  )
}
