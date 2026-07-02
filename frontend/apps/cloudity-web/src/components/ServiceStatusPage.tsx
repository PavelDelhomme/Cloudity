import React from 'react'

type Props = {
  title?: string
  message: string
  detail?: string
  onRetry?: () => void
  retryLabel?: string
}

/** Écran plein page pour indisponibilité temporaire (stack en démarrage, API hors ligne). */
export function ServiceStatusPage({
  title = 'Cloudity indisponible',
  message,
  detail,
  onRetry,
  retryLabel = 'Réessayer',
}: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-900/80 p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl">
          ⏳
        </div>
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <p className="text-slate-300 mb-3">{message}</p>
        {detail ? (
          <p className="text-xs text-slate-500 font-mono break-all mb-4">{detail}</p>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-500 px-4 py-2 text-sm font-medium text-white"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
