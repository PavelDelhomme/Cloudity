/**
 * SecureSettingsPage — wrapper pour `/app/settings/sec/:token`.
 *
 * Valide le slug via `POST /auth/security-paths/validate` avant d'afficher
 * `AppSettingsPage`. Si le slug est expiré / falsifié, on redirige vers
 * `/app/settings/canonical` (bypass rotation — **pas** `/app/settings`,
 * sinon SettingsRedirect réémet un slug et on entre en boucle 403/429).
 *
 * Erreurs réseau / 429 : message UI, pas de redirect en boucle.
 *
 * En-têtes durcis (cf. PASS-CRYPTO § 8 et URL-CAPABILITIES § 4) :
 *  - `<meta name="referrer" content="no-referrer">` injecté pendant que la
 *    page est montée — évite que le slug fuite via le `Referer` quand
 *    l'utilisateur clique sur un lien externe depuis cette page.
 */

import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../authContext'
import { validateSecurePath } from '../../../api'
import AppSettingsPage from './AppSettingsPage'
import { CANONICAL_SETTINGS_SECURITY } from './useSecurePaths'

/** Page settings sans rotation slug — sortie de boucle validate → redirect. */
export const SETTINGS_CANONICAL_PAGE = `${CANONICAL_SETTINGS_SECURITY}/canonical`

type State =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }

export default function SecureSettingsPage() {
  const { token } = useParams<{ token: string }>()
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false
    if (!token || !accessToken) {
      setState({ kind: 'invalid' })
      return () => {
        cancelled = true
      }
    }
    validateSecurePath(accessToken, token, 'settings_security')
      .then((ok) => {
        if (cancelled) return
        setState({ kind: ok ? 'ok' : 'invalid' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Impossible de valider le lien sécurisé.'
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [token, accessToken])

  // Hardening header : pendant que la page sécurisée est montée, on impose
  // `Referrer-Policy: no-referrer` côté DOM. C'est une best-effort (les
  // navigateurs modernes le respectent) qui complète le `Cache-Control:
  // no-store` côté serveur.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  // Slug invalide → page canonique (pas /app/settings, qui re-rotaterait).
  useEffect(() => {
    if (state.kind === 'invalid') {
      navigate(SETTINGS_CANONICAL_PAGE, { replace: true })
    }
  }, [state, navigate])

  if (state.kind === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-500" role="status" aria-live="polite">
        <span className="animate-pulse">Validation du lien sécurisé…</span>
      </div>
    )
  }
  if (state.kind === 'invalid') {
    return null
  }
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center" role="alert">
        <p className="text-red-600 dark:text-red-400 text-sm max-w-md">{state.message}</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
          Trop de tentatives ou problème réseau. Attendez un moment puis ouvrez les réglages sans le lien rotatif.
        </p>
        <Link
          to={SETTINGS_CANONICAL_PAGE}
          className="text-sm font-medium text-brand-600 hover:underline"
          replace
        >
          Ouvrir les réglages
        </Link>
      </div>
    )
  }
  return <AppSettingsPage />
}
