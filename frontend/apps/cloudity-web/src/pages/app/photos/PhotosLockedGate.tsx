import React, { useCallback, useState } from 'react'
import { Fingerprint, Lock, Shield } from 'lucide-react'
import {
  hasPhotosLockedPin,
  hasPhotosLockedWebAuthn,
  isPhotosLockedWebAuthnSupported,
  PHOTOS_LOCKED_PIN_MAX,
  PHOTOS_LOCKED_PIN_MIN,
  registerPhotosLockedWebAuthn,
  setupPhotosLockedPin,
  unlockPhotosLockedWithWebAuthn,
  verifyPhotosLockedPin,
} from './photosLockedVault'

type PhotosLockedGateProps = {
  scope: string
  onUnlocked: () => void
}

export function PhotosLockedGate({ scope, onUnlocked }: PhotosLockedGateProps) {
  const [pinConfigured, setPinConfigured] = useState(() => hasPhotosLockedPin(scope))
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [enableBiometricAfterSetup, setEnableBiometricAfterSetup] = useState(true)
  const [biometricRegistered, setBiometricRegistered] = useState(() => hasPhotosLockedWebAuthn(scope))
  const needsSetup = !pinConfigured
  const biometricAvailable = isPhotosLockedWebAuthnSupported()

  const resetInputs = useCallback(() => {
    setPin('')
    setConfirmPin('')
  }, [])

  const finishUnlock = useCallback(() => {
    resetInputs()
    setError(null)
    onUnlocked()
  }, [onUnlocked, resetInputs])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await setupPhotosLockedPin(scope, pin, confirmPin)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPinConfigured(true)
      if (enableBiometricAfterSetup && biometricAvailable) {
        try {
          await registerPhotosLockedWebAuthn(scope)
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
      finishUnlock()
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockWithPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ok = await verifyPhotosLockedPin(scope, pin)
      if (!ok) {
        setError('Code incorrect.')
        return
      }
      finishUnlock()
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockWithBiometric = async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await unlockPhotosLockedWithWebAuthn(scope)
      if (!ok) {
        setError('Déverrouillage biométrique annulé ou indisponible.')
        return
      }
      finishUnlock()
    } finally {
      setBusy(false)
    }
  }

  const handleRegisterBiometric = async () => {
    setBusy(true)
    setError(null)
    try {
      await registerPhotosLockedWebAuthn(scope)
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
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {needsSetup ? 'Protéger le coffre verrouillé' : 'Coffre verrouillé'}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {needsSetup
          ? 'Choisissez un code à 4–8 chiffres. Les photos verrouillées ne s’affichent qu’après déverrouillage.'
          : 'Saisissez votre code ou utilisez la biométrie de cet appareil. Aucune miniature n’est chargée avant validation.'}
      </p>

      {needsSetup ? (
        <form className="mt-6 w-full space-y-3 text-left" onSubmit={(e) => void handleSetup(e)}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Code
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern={`[0-9]{${PHOTOS_LOCKED_PIN_MIN},${PHOTOS_LOCKED_PIN_MAX}}`}
              minLength={PHOTOS_LOCKED_PIN_MIN}
              maxLength={PHOTOS_LOCKED_PIN_MAX}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PHOTOS_LOCKED_PIN_MAX))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center tracking-[0.35em] dark:border-slate-600 dark:bg-slate-900"
              placeholder="••••"
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirmer le code
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern={`[0-9]{${PHOTOS_LOCKED_PIN_MIN},${PHOTOS_LOCKED_PIN_MAX}}`}
              minLength={PHOTOS_LOCKED_PIN_MIN}
              maxLength={PHOTOS_LOCKED_PIN_MAX}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, PHOTOS_LOCKED_PIN_MAX))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center tracking-[0.35em] dark:border-slate-600 dark:bg-slate-900"
              placeholder="••••"
              required
            />
          </label>
          {biometricAvailable ? (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={enableBiometricAfterSetup}
                onChange={(e) => setEnableBiometricAfterSetup(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Activer empreinte / visage sur cet appareil
            </label>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : 'Créer le code'}
          </button>
        </form>
      ) : (
        <div className="mt-6 w-full space-y-3">
          <form className="space-y-3 text-left" onSubmit={(e) => void handleUnlockWithPin(e)}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Code
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern={`[0-9]{${PHOTOS_LOCKED_PIN_MIN},${PHOTOS_LOCKED_PIN_MAX}}`}
                minLength={PHOTOS_LOCKED_PIN_MIN}
                maxLength={PHOTOS_LOCKED_PIN_MAX}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PHOTOS_LOCKED_PIN_MAX))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center tracking-[0.35em] dark:border-slate-600 dark:bg-slate-900"
                placeholder="••••"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Vérification…' : 'Déverrouiller avec le code'}
            </button>
          </form>

          {biometricRegistered ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleUnlockWithBiometric()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Fingerprint className="h-4 w-4" aria-hidden />
              Déverrouiller avec biométrie
            </button>
          ) : biometricAvailable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRegisterBiometric()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Fingerprint className="h-4 w-4" aria-hidden />
              Activer empreinte / visage
            </button>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <p className="mt-6 flex items-start gap-2 text-left text-xs text-slate-500 dark:text-slate-500">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Protection locale sur cet appareil. Le chiffrement serveur dédié du coffre reste prévu pour une version ultérieure.
      </p>
    </div>
  )
}
