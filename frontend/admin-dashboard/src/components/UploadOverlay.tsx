import React from 'react'
import { Upload, Check, AlertCircle, Loader2, X } from 'lucide-react'
import { useUpload } from '../uploadContext'
import { formatFileSize } from '../utils/formatFileSize'

export function UploadOverlay() {
  const { items, removeItem, clearDone } = useUpload()
  if (items.length === 0) return null

  const doneOrError = items.filter((i) => i.status === 'done' || i.status === 'error')
  const hasDoneOrError = doneOrError.length > 0

  return (
    <div className="fixed top-0 right-0 z-50 w-80 max-w-[calc(100vw-1rem)] h-full pointer-events-none flex flex-col items-end justify-start pt-20 pb-4 pr-4">
      <div className="pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            Téléversements
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
        </div>
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
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={it.name}>
                  {it.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {it.size != null ? formatFileSize(it.size) : ''}
                  {it.status === 'error' && it.error ? ` — ${it.error}` : ''}
                </p>
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
