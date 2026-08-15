import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FlaskConical } from 'lucide-react'
import {
  devQuickLogin,
  fetchDevQuickLoginPersonas,
  type DevQuickLoginPersona,
} from '../../api'

type Props = {
  disabled?: boolean
  onSuccess: (accessToken: string, refreshToken: string | undefined, email: string) => void
}

/** Boutons temporaires de connexion sans mot de passe (stack locale uniquement). */
export function DevQuickLoginPanel({ disabled, onSuccess }: Props) {
  const [personas, setPersonas] = useState<DevQuickLoginPersona[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDevQuickLoginPersonas()
      .then((res) => {
        if (cancelled) return
        if (res?.enabled && res.personas?.length) setPersonas(res.personas)
        else setPersonas(null)
      })
      .catch(() => {
        if (!cancelled) setPersonas(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!personas?.length) return null

  const connect = async (p: DevQuickLoginPersona) => {
    setBusyId(p.id)
    try {
      const res = await devQuickLogin({ persona: p.id })
      const email = res.email || p.email
      onSuccess(res.access_token, res.refresh_token ?? undefined, email)
      toast.success(`Connecté en tant que ${p.label} (${email})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connexion rapide échouée')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-300/80 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        Dev — connexion rapide
      </div>
      <p className="mb-3 text-xs text-amber-900/80 dark:text-amber-100/70">
        Sans mot de passe (local uniquement). Choisis un compte :
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled || busyId != null}
            onClick={() => void connect(p)}
            className="flex-1 rounded-lg border border-amber-400/70 bg-white px-3 py-2 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-slate-800 dark:text-amber-50 dark:hover:bg-slate-700"
          >
            {busyId === p.id ? 'Connexion…' : p.label}
            <span className="mt-0.5 block truncate text-[11px] font-normal opacity-70">{p.email}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
