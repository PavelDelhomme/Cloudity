import React, { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import {
  APP_LOCKED_SESSION_TTL_MS,
  changeAppLockedPin,
  getAppLockedKdfSalt,
  grantAppLockedVaultSession,
  verifyAppLockedPin,
  type AppLockedVaultKind,
} from './appLockedVault'
import { rotateAppVaultPin } from './appVaultPinRotation'

type AppLockedPinChangeSectionProps = {
  kind: AppLockedVaultKind
  scope: string | null
  appLabel: string
  accessToken: string | null
}

export function AppLockedPinChangeSection({
  kind,
  scope,
  appLabel,
  accessToken,
}: AppLockedPinChangeSectionProps) {
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)

  const handleChange = useCallback(async () => {
    if (!scope) {
      setError('Session incomplète : reconnectez-vous avant de changer le code.')
      return
    }
    if (!accessToken) {
      setError('Session expirée : reconnectez-vous avant de changer le code.')
      return
    }
    setBusy(true)
    setError(null)
    setProgressLabel(null)
    try {
      const result = await rotateAppVaultPin(
        accessToken,
        kind,
        scope,
        currentPin,
        nextPin,
        confirmPin,
        {
          verifyPin: (_scope, pin) => verifyAppLockedPin(kind, _scope, pin),
          changePin: (_scope, cur, nxt, conf) =>
            changeAppLockedPin(kind, _scope, cur, nxt, conf),
          getKdfSalt: (_scope) => getAppLockedKdfSalt(kind, _scope),
          onSessionKeyRotated: (_scope, vaultKeyB64u) => {
            grantAppLockedVaultSession(kind, _scope, APP_LOCKED_SESSION_TTL_MS, vaultKeyB64u)
          },
        },
        (p) => {
          const label =
            p.phase === 'notes'
              ? 'notes'
              : p.phase === 'contacts'
                ? 'contacts'
                : 'fichiers'
          setProgressLabel(`Re-chiffrement ${label}… ${p.done}/${p.total}`)
        }
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrentPin('')
      setNextPin('')
      setConfirmPin('')
      if (result.reencrypted > 0) {
        toast.success(
          `Code ${appLabel} mis à jour — ${result.reencrypted} élément(s) re-chiffré(s)`
        )
      } else {
        toast.success(`Code du coffre ${appLabel} mis à jour`)
      }
    } finally {
      setBusy(false)
      setProgressLabel(null)
    }
  }, [accessToken, appLabel, confirmPin, currentPin, kind, nextPin, scope])

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
        Changer le code du coffre {appLabel}
      </h3>
      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
        Le nouveau code reste local à ce navigateur. Les données chiffrées sur le serveur sont
        automatiquement re-chiffrées.
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
      {progressLabel ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
          {progressLabel}
        </p>
      ) : null}
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
        {busy ? 'Mise à jour…' : 'Changer le code PIN'}
      </button>
    </div>
  )
}
