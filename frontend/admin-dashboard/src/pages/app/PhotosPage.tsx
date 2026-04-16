import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Image as ImageIcon, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../authContext'
import {
  downloadDriveFile,
  fetchDrivePhotosTimeline,
  uploadDriveFileWithProgress,
  type DriveNode,
} from '../../api'

const PAGE_SIZE = 48

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
      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {err ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 p-1 text-center">
          Échec du chargement
        </span>
      ) : url ? (
        <img
          src={url}
          alt={node.name}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
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
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 md:p-6"
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
            className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-md"
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
        Fichiers stockés dans le Drive Cloudity — organisez-les depuis{' '}
        <Link to="/app/drive" className="underline hover:text-white">
          Drive
        </Link>
        .
      </p>
    </div>
  )
}

export default function PhotosPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const photosQuery = useInfiniteQuery({
    queryKey: ['drive', 'photos', 'timeline'],
    queryFn: ({ pageParam }) =>
      fetchDrivePhotosTimeline(accessToken!, { limit: PAGE_SIZE, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.offset + lastPage.limit : undefined),
    enabled: !!accessToken,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const flatItems = useMemo(() => {
    const pages = photosQuery.data?.pages ?? []
    return pages.flatMap((p) => p.items)
  }, [photosQuery.data?.pages])

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      if (!accessToken) throw new Error('Non connecté')
      const list = Array.from(files)
      for (const file of list) {
        await new Promise<void>((resolve, reject) => {
          uploadDriveFileWithProgress(accessToken, null, file, undefined, false)
            .then(() => resolve())
            .catch(reject)
        })
      }
    },
    onSuccess: () => {
      toast.success('Téléversement terminé')
      void queryClient.invalidateQueries({ queryKey: ['drive', 'photos', 'timeline'] })
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

  const openAt = useCallback((node: DriveNode) => {
    const i = flatItems.findIndex((n) => n.id === node.id)
    setLightboxIndex(i >= 0 ? i : 0)
  }, [flatItems])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const lightboxNode =
    lightboxIndex !== null && flatItems[lightboxIndex] ? flatItems[lightboxIndex] : null

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Photos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Chronologie de vos images Cloudity (même stockage que le Drive). Téléversez ici ou placez des fichiers
            image dans n’importe quel dossier Drive — ils apparaissent ici automatiquement.
          </p>
        </div>
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
            disabled={photosQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${photosQuery.isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={onPickFiles}
            disabled={!accessToken || uploadMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Ajouter des photos
          </button>
        </div>
      </div>

      {!accessToken && (
        <p className="text-sm text-slate-500">Connectez-vous pour voir vos photos.</p>
      )}

      {photosQuery.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {(photosQuery.error as Error)?.message || 'Erreur de chargement'}
        </p>
      )}

      {photosQuery.isLoading && accessToken && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        </div>
      )}

      {accessToken && !photosQuery.isLoading && flatItems.length === 0 && !photosQuery.isError && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 flex flex-col items-center justify-center text-center">
          <ImageIcon className="h-12 w-12 text-slate-300 dark:text-slate-500 mb-4" />
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Aucune image pour l’instant. Ajoutez des photos (racine Drive) ou déposez-en dans le Drive.
          </p>
          <button
            type="button"
            onClick={onPickFiles}
            className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
          >
            Téléverser des images
          </button>
        </div>
      )}

      {flatItems.length > 0 && accessToken && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {flatItems.map((node) => (
              <PhotoThumb key={node.id} node={node} token={accessToken} onOpen={openAt} />
            ))}
          </div>
          {photosQuery.hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void photosQuery.fetchNextPage()}
                disabled={photosQuery.isFetchingNextPage}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
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
