import React, { useContext } from 'react'
import { Upload, Check, AlertCircle, Loader2, X } from 'lucide-react'
import { UploadContext } from '../uploadContext'
import { formatFileSize } from '../utils/formatFileSize'

/** Ne lance jamais : si le contexte est absent (ex. HMR), on n'affiche rien. */
export function UploadOverlay() {
  const ctx = useContext(UploadContext)
  if (!ctx || !Array.isArray(ctx.items)) return null
  const { items, removeItem, clearDone, replaceUpload, cancelConflict } = ctx
  if (items.length === 0) return null

  const doneOrError = items.filter((i) => i.status === 'done' || i.status === 'error')
  const hasDoneOrError = doneOrError.length > 0
  const total = items.length
  const inProgress = items.filter((i) => i.status === 'uploading' || i.status === 'pending').length
  const currentUploading = items.find((i) => i.status === 'uploading')
  const hasConflict = items.some((i) => i.status === 'conflict')

  return (
    <div className="fixed top-0 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] h-full pointer-events-none flex flex-col items-end justify-start pt-20 pb-4 pr-4">
      <div className="pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            Téléversements
            {total > 0 && (
              <span className="text-slate-500 dark:text-slate-400 font-normal">
                ({total - inProgress}/{total})
              </span>
            )}
          </span>
          {hasDoneOrError && (
            <button
              type="button"
              onClick={clearDone}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Effacer terminés
            </button>
          )}
          {hasConflict && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Fichier existant</span>
          )}
        </div>
        {currentUploading && (
          <div className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 truncate" title={currentUploading.name}>
            En cours : {currentUploading.name}
            {currentUploading.status === 'uploading' && currentUploading.progress != null && (
              <span className="ml-1 font-medium text-brand-600 dark:text-brand-400"> — {currentUploading.progress} %</span>
            )}
          </div>
        )}
        <ul className="overflow-y-auto p-2 space-y-1 min-h-0">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-700/50 text-left"
            >
              <span className="flex-shrink-0">
                {it.status === 'pending' && <Upload className="h-4 w-4 text-slate-400" />}
                {it.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                {it.status === 'done' && <Check className="h-4 w-4 text-green-500" />}
                {it.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                {it.status === 'conflict' && <AlertCircle className="h-4 w-4 text-amber-500" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={it.name}>
                  {it.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {it.size != null ? formatFileSize(it.size) : ''}
                  {it.status === 'uploading' && it.progress != null ? ` — ${it.progress} %` : ''}
                  {it.status === 'error' && it.error ? ` — ${it.error}` : ''}
                  {it.status === 'conflict' && ' — Un fichier avec ce nom existe déjà.'}
                </p>
                {it.status === 'conflict' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => replaceUpload(it.id)}
                      className="text-xs font-medium px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                    >
                      Remplacer
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelConflict(it.id)}
                      className="text-xs font-medium px-2 py-1 rounded border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Annuler
                    </button>
                  </div>
                )}
                {it.status === 'uploading' && it.progress != null && (
                  <div className="mt-1 h-1 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 dark:bg-brand-400 transition-all duration-150"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="flex-shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
