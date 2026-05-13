/**
 * SecureSettingsPage — wrapper pour `/app/settings/sec/:token`.
 *
 * Valide le slug via `POST /auth/security-paths/validate` avant d'afficher
 * `AppSettingsPage`. Si le slug est expiré / falsifié, on redirige vers le
 * chemin canonique `/app/settings` (qui ré-émet un slug frais).
 *
 * En-têtes durcis (cf. PASS-CRYPTO § 8 et URL-CAPABILITIES § 4) :
 *  - `<meta name="referrer" content="no-referrer">` injecté pendant que la
 *    page est montée — évite que le slug fuite via le `Referer` quand
 *    l'utilisateur clique sur un lien externe depuis cette page.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../authContext'
import { validateSecurePath } from '../../../api'
import AppSettingsPage from './AppSettingsPage'
import { CANONICAL_SETTINGS_SECURITY } from './useSecurePaths'

type State = { kind: 'checking' } | { kind: 'ok' } | { kind: 'invalid' }

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
      .catch(() => {
        if (cancelled) return
        // Erreur réseau → on ne bloque pas l'UI, on redirige vers le canonique
        // qui re-tentera de fetcher un slug frais.
        setState({ kind: 'invalid' })
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

  // Redirection automatique si le slug est invalide.
  useEffect(() => {
    if (state.kind === 'invalid') {
      navigate(CANONICAL_SETTINGS_SECURITY, { replace: true })
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
  return <AppSettingsPage />
}
