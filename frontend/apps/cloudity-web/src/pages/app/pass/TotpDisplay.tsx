import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudity/ui'
import { Copy, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateTotp, parseOtpauthUri, totpSecondsRemaining } from './totp'
import { copyWithAutoClear } from './clipboardAutoClear'
import { loadCachedUserPreferences } from '../../../lib/userPreferencesStore'

interface Props {
  /** URI `otpauth://totp/...` (le secret n'est jamais loggé). */
  otpauthUri: string
}

/**
 * Affiche le **code TOTP courant** + compte à rebours (anneau circulaire). Le
 * code est régénéré dès que la période expire. Tout est calculé localement
 * via la Web Crypto API — aucune requête réseau.
 */
export default function TotpDisplay({ otpauthUri }: Props) {
  const parsed = parseOtpauthUri(otpauthUri)

  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number>(parsed?.period ?? 30)
  const lastAutoCopiedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!parsed) {
      setError('URI TOTP invalide.')
      return
    }
    let cancelled = false
    const tick = async () => {
      const now = Date.now()
      try {
        const c = await generateTotp(parsed, now)
        if (!cancelled) {
          setCode(c)
          setError(null)
          const prefs = loadCachedUserPreferences().pass
          if (
            prefs.clipboardEnabled &&
            prefs.totpAutoCopy &&
            c &&
            lastAutoCopiedRef.current !== c
          ) {
            lastAutoCopiedRef.current = c
            try {
              await copyWithAutoClear(c, {
                ttlMs: prefs.clipboardClearMs > 0 ? prefs.clipboardClearMs : 30_000,
              })
            } catch {
              /* permission refusée */
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur TOTP')
          setCode(null)
        }
      }
      if (!cancelled) setSecondsLeft(totpSecondsRemaining(parsed, now))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [otpauthUri, parsed])

  if (!parsed) {
    return (
      <div className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
        <AlertTriangle className="w-4 h-4" aria-hidden />
        URI TOTP invalide
      </div>
    )
  }

  const period = parsed.period ?? 30
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const progress = secondsLeft / period
  const dashOffset = circumference * (1 - progress)
  const lowTime = secondsLeft <= 5

  const onCopy = async () => {
    if (!code) return
    const prefs = loadCachedUserPreferences().pass
    if (!prefs.clipboardEnabled) {
      toast.error('Copie presse-papier désactivée (Paramètres → Pass)')
      return
    }
    try {
      await copyWithAutoClear(code, {
        ttlMs: prefs.clipboardClearMs > 0 ? Math.min(secondsLeft * 1000, prefs.clipboardClearMs) : 0,
        onCleared: () => toast('Code TOTP effacé'),
      })
      toast.success(`Code TOTP copié`)
    } catch (err) {
      toast.error(`Copie : ${err instanceof Error ? err.message : 'erreur'}`)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {parsed.issuer ?? '2FA'}
          {parsed.accountName ? ` · ${parsed.accountName}` : null}
        </span>
        <span
          className={`font-mono text-lg font-semibold tracking-widest ${
            lowTime
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-900 dark:text-slate-100'
          }`}
          aria-live="polite"
        >
          {error ? '— —— —' : code ?? '······'}
        </span>
      </div>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <circle
          cx="16"
          cy="16"
          r={radius}
          strokeWidth="2"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          fill="none"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          strokeWidth="2"
          stroke="currentColor"
          className={lowTime ? 'text-amber-500' : 'text-brand-500'}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 16 16)"
          style={{ transition: 'stroke-dashoffset 0.4s linear' }}
        />
      </svg>
      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-6 text-right">
        {secondsLeft}s
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={onCopy}
        disabled={!code}
        aria-label="Copier le code TOTP"
        title={`Copier (auto-effacement ${Math.min(secondsLeft, 30)} s)`}
      >
        <Copy className="w-4 h-4" aria-hidden />
      </Button>
      {error ? (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
          {error}
        </span>
      ) : null}
    </div>
  )
}
