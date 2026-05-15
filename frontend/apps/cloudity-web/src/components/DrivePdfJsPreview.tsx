import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** Limite pages : aperçu modale ; évite de figer l’UI sur des PDF énormes. */
const MAX_PREVIEW_PAGES = 60

export type DrivePdfJsPreviewProps = {
  blobUrl: string
  fileTitle: string
}

/**
 * Aperçu PDF **sans** `<embed>` / lecteur natif Chrome : ceux-ci affichent la barre Google (ex. « Ajouter à Drive »)
 * alors que le fichier est pourtant servi en **blob: local** — aucune intégration Google Drive côté Cloudity.
 * Ici : PDF.js (Mozilla) → canvas, worker bundlé par Vite (`?url`).
 */
export function DrivePdfJsPreview({ blobUrl, fileTitle }: DrivePdfJsPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ok' | 'error'>('loading')
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el || !blobUrl) return

    let cancelled = false
    let loadingTask: { destroy?: () => void; promise: Promise<import('pdfjs-dist').PDFDocumentProxy> } | null = null
    let pdf: import('pdfjs-dist').PDFDocumentProxy | undefined

    el.innerHTML = ''
    setPhase('loading')
    setHint(null)

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

        loadingTask = pdfjs.getDocument({ url: blobUrl, isEvalSupported: false })
        pdf = await loadingTask.promise
        loadingTask = null

        if (cancelled) return

        const total = pdf.numPages
        const n = Math.min(total, MAX_PREVIEW_PAGES)
        if (total > MAX_PREVIEW_PAGES) {
          setHint(
            `Aperçu : ${MAX_PREVIEW_PAGES} premières pages sur ${total}. Utilisez Télécharger pour le document complet.`
          )
        }

        const scale = typeof window !== 'undefined' && window.devicePixelRatio >= 2 ? 1.35 : 1.2

        for (let p = 1; p <= n; p++) {
          if (cancelled) break
          const page = await pdf.getPage(p)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('canvas 2d indisponible')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.maxWidth = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.className =
            'mx-auto mb-3 rounded border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900'
          canvas.setAttribute('aria-label', `${fileTitle} — page ${p}`)
          el.appendChild(canvas)
          await page.render({ canvasContext: ctx, viewport }).promise
        }

        if (!cancelled) setPhase('ok')
      } catch {
        if (loadingTask && typeof loadingTask.destroy === 'function') {
          try {
            loadingTask.destroy()
          } catch {
            /* ignore */
          }
        }
        loadingTask = null
        if (!cancelled) setPhase('error')
      } finally {
        if (pdf) {
          try {
            await pdf.cleanup()
          } catch {
            /* ignore */
          }
          try {
            await pdf.destroy()
          } catch {
            /* ignore */
          }
        }
        pdf = undefined
      }
    })()

    return () => {
      cancelled = true
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try {
          loadingTask.destroy()
        } catch {
          /* ignore */
        }
      }
      el.innerHTML = ''
    }
  }, [blobUrl, fileTitle])

  return (
    <div
      data-testid="drive-pdf-preview"
      className="mt-4 flex flex-col rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-900 min-h-[420px] max-h-[75vh]"
    >
      {phase === 'loading' ? (
        <div className="flex flex-1 items-center justify-center min-h-[420px]" aria-busy="true" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
          <span className="sr-only">Chargement du PDF…</span>
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center min-h-[200px]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Impossible d’afficher ce PDF dans l’aperçu (fichier endommagé ou non pris en charge).
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Utilisez Télécharger pour l’ouvrir avec une application locale.</p>
        </div>
      ) : null}
      <div
        ref={hostRef}
        className={`flex-1 overflow-auto px-2 py-3 min-h-0 ${phase === 'loading' ? 'hidden' : ''}`}
        role="region"
        aria-label={`Aperçu PDF ${fileTitle}`}
      />
      {hint && phase === 'ok' ? <p className="shrink-0 border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}
