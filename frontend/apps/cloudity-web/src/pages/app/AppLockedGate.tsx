import React, { useCallback, useState } from 'react'
import { Fingerprint, Lock, Shield } from 'lucide-react'
import {
  APP_LOCKED_PIN_MAX,
  APP_LOCKED_PIN_MIN,
  type AppLockedVaultKind,
  hasAppLockedPin,
  hasAppLockedWebAuthn,
  isAppLockedWebAuthnSupported,
  readAppLockedVaultKeyB64u,
  registerAppLockedWebAuthn,
  setupAppLockedPin,
  unlockAppLockedWithWebAuthn,
  verifyAppLockedPin,
} from './appLockedVault'
import { deriveAndStoreAppVaultKey, exportAppVaultKeyB64u, importAppVaultKeyB64u } from './appVaultKeySession'

type AppLockedGateProps = {
  kind: AppLockedVaultKind
  scope: string
  appLabel: string
  description: string
  onUnlocked: (vaultKeyB64u?: string) => void
}

export function AppLockedGate({ kind, scope, appLabel, description, onUnlocked }: AppLockedGateProps) {
  const [pinConfigured, setPinConfigured] = useState(() => hasAppLockedPin(kind, scope))
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [enableBiometricAfterSetup, setEnableBiometricAfterSetup] = useState(true)
  const [biometricRegistered, setBiometricRegistered] = useState(() => hasAppLockedWebAuthn(kind, scope))
  const needsSetup = !pinConfigured
  const biometricAvailable = isAppLockedWebAuthnSupported()

  const resetInputs = useCallback(() => {
    setPin('')
    setConfirmPin('')
  }, [])

  const finishUnlock = useCallback(
    (vaultKeyB64u?: string) => {
      resetInputs()
      setError(null)
      onUnlocked(vaultKeyB64u)
    },
    [onUnlocked, resetInputs]
  )

  const finishUnlockWithPin = useCallback(
    async (pinValue: string) => {
      await deriveAndStoreAppVaultKey(kind, scope, pinValue)
      finishUnlock(exportAppVaultKeyB64u(kind, scope) ?? undefined)
    },
    [finishUnlock, kind, scope]
  )

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await setupAppLockedPin(kind, scope, pin, confirmPin)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPinConfigured(true)
      if (enableBiometricAfterSetup && biometricAvailable) {
        try {
          await registerAppLockedWebAuthn(kind, scope, appLabel)
          setBiometricRegistered(true)
        } catch (bioErr) {
          setError(
            bioErr instanceof Error
              ? `${bioErr.message} Le code seul reste actif.`
              : 'Biométrie non enregistrée. Le code seul reste actif.'
          )
          resetInputs()
          return
        }
      }
      await finishUnlockWithPin(pin)
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockWithPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ok = await verifyAppLockedPin(kind, scope, pin)
      if (!ok) {
        setError('Code incorrect.')
        return
      }
      await finishUnlockWithPin(pin)
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockWithBiometric = async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await unlockAppLockedWithWebAuthn(kind, scope)
      if (!ok) {
        setError('Déverrouillage biométrique annulé ou indisponible.')
        return
      }
      const cached = readAppLockedVaultKeyB64u(kind, scope)
      if (cached) {
        importAppVaultKeyB64u(kind, scope, cached)
        finishUnlock(cached)
        return
      }
      setError('Entrez votre code une fois pour déchiffrer les données serveur.')
    } finally {
      setBusy(false)
    }
  }

  const handleRegisterBiometric = async () => {
    setBusy(true)
    setError(null)
    try {
      await registerAppLockedWebAuthn(kind, scope, appLabel)
      setBiometricRegistered(true)
    } catch (bioErr) {
      setError(bioErr instanceof Error ? bioErr.message : 'Impossible d’activer la biométrie.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border border-slate-200 bg-slate-50/90 px-6 py-10 text-center shadow-sm dark:border-slate-600 dark:bg-slate-800/60">
      <div className="mb-4 rounded-full bg-slate-200/80 p-4 dark:bg-slate-700/80">
        <Lock className="h-10 w-10 text-slate-600 dark:text-slate-300" aria-hidden />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Coffre {appLabel} verrouillé</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Le code dérive une clé de chiffrement locale ; le serveur ne stocke que des blobs opaques.
      </p>

      <form className="mt-6 flex w-full flex-col gap-3 text-left" onSubmit={needsSetup ? handleSetup : handleUnlockWithPin}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {needsSetup ? 'Définir un code' : 'Code'}
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            minLength={APP_LOCKED_PIN_MIN}
            maxLength={APP_LOCKED_PIN_MAX}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            aria-label={needsSetup ? 'Définir un code' : 'Code'}
          />
        </label>
        {needsSetup ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Confirmer le code</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={APP_LOCKED_PIN_MIN}
                maxLength={APP_LOCKED_PIN_MAX}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                aria-label="Confirmer le code"
              />
            </label>
            {biometricAvailable ? (
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={enableBiometricAfterSetup}
                  onChange={(e) => setEnableBiometricAfterSetup(e.target.checked)}
                />
                Activer empreinte / visage après création
              </label>
            ) : null}
          </>
        ) : null}
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Shield className="h-4 w-4" aria-hidden />
          {needsSetup ? 'Créer le code et déverrouiller' : 'Déverrouiller avec le code'}
        </button>
      </form>

      {!needsSetup && biometricAvailable ? (
        <div className="mt-3 flex w-full flex-col gap-2">
          {biometricRegistered ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleUnlockWithBiometric()}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Fingerprint className="h-4 w-4" aria-hidden />
              Déverrouiller avec biométrie
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRegisterBiometric()}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Fingerprint className="h-4 w-4" aria-hidden />
              Activer empreinte / visage
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
