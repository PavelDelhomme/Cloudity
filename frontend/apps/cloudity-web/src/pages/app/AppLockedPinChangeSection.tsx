import React, { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { changeAppLockedPin, type AppLockedVaultKind } from './appLockedVault'

type AppLockedPinChangeSectionProps = {
  kind: AppLockedVaultKind
  scope: string | null
  appLabel: string
}

export function AppLockedPinChangeSection({ kind, scope, appLabel }: AppLockedPinChangeSectionProps) {
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleChange = useCallback(async () => {
    if (!scope) {
      setError('Session incomplète : reconnectez-vous avant de changer le code.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await changeAppLockedPin(kind, scope, currentPin, nextPin, confirmPin)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrentPin('')
      setNextPin('')
      setConfirmPin('')
      toast.success(`Code du coffre ${appLabel} mis à jour`)
    } finally {
      setBusy(false)
    }
  }, [appLabel, confirmPin, currentPin, kind, nextPin, scope])

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
        Changer le code du coffre {appLabel}
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
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            aria-label="Code actuel"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-neutral-800 dark:text-slate-200">Nouveau code</span>
          <input
            type="password"
            inputMode="numeric"
            value={nextPin}
            onChange={(e) => setNextPin(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            aria-label="Nouveau code"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-neutral-800 dark:text-slate-200">Confirmer le nouveau code</span>
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            aria-label="Confirmer le nouveau code"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleChange()}
        className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Changer le code PIN
      </button>
    </div>
  )
}
