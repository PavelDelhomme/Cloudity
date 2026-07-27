import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { login as apiLogin, verify2FA } from '../../api'
import { isAdminUiReturnPath, normalizePostLoginPath, formatAuthError } from '@cloudity/shared'
import { navigateAfterAuth } from '../../postAuthNavigate'
import { isWebAuthnSupported, loginWithPasskey, loginWithPasskeyDiscoverable } from '../../webauthn'
import { Key, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

type LoginStep = 'email' | 'password'

export default function LoginPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<LoginStep>('email')
  const [loading, setLoading] = useState(false)
  // Étape 2FA : si `requires_2fa` revient du backend, on bascule sur un
  // formulaire dédié qui accepte un code TOTP 6 chiffres OU un code de
  // récupération `XXXX-XXXX-XXXX`.
  const [twoFAStep, setTwoFAStep] = useState(false)
  const [twoFACode, setTwoFACode] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  // Calcule la destination post-login en lisant la query string au moment
  // du submit (évite la course avec RedirectIfAuth / flush React).
  const computeReturnDestination = () => {
    const q = typeof window !== 'undefined' ? window.location.search : location.search
    const p = new URLSearchParams(q)
    const next = p.get('next')
    const stateRt = (location.state as { returnTo?: string })?.returnTo
    const raw = next ?? stateRt ?? '/app'
    return raw.startsWith('/app') || isAdminUiReturnPath(raw) ? normalizePostLoginPath(raw) : '/app'
  }

  const normalizedEmail = email.trim()

  const finishLogin = (
    accessToken: string,
    refreshToken: string | undefined,
    authEmail: string,
  ) => {
    setAuth(accessToken, refreshToken, 1, authEmail)
    navigateAfterAuth(navigate, computeReturnDestination())
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalizedEmail) {
      toast.error('Saisis ton email')
      return
    }
    setStep('password')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalizedEmail || !password) {
      toast.error('Email et mot de passe requis')
      return
    }
    setLoading(true)
    setLoginError(null)
    try {
      const res = await apiLogin({ email: normalizedEmail, password })
      if (res.requires_2fa) {
        // Étape 2 : on bascule sur le formulaire 2FA. Le backend a déjà validé
        // le mot de passe ; il attend maintenant un TOTP ou un code de récup.
        setTwoFAStep(true)
        setTwoFACode('')
        toast.success('Mot de passe validé. Saisis ton code 2FA ou un code de récupération.')
        return
      }
      finishLogin(res.access_token, res.refresh_token ?? undefined, normalizedEmail)
      toast.success('Connexion réussie')
    } catch (err) {
      const msg = formatAuthError(err, 'login')
      setLoginError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!twoFACode.trim()) {
      toast.error('Saisis ton code TOTP ou un code de récupération')
      return
    }
    setLoading(true)
    try {
      const res = await verify2FA({ email: normalizedEmail, code: twoFACode.trim() })
      finishLogin(res.access_token, res.refresh_token ?? undefined, normalizedEmail)
      if (res.used_recovery_code) {
        toast.success('Connexion via code de récupération — pense à régénérer.', { duration: 6000 })
      } else {
        toast.success('Connexion 2FA réussie')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Code invalide')
    } finally {
      setLoading(false)
    }
  }

  // Conditional UI / Discoverable Credentials (Phase W2 — sprint Pass).
  // Le browser propose la passkey directement au focus du champ email — comme
  // GitHub / Google. Le PM tiers (Proton Pass, iCloud Keychain, Bitwarden)
  // peut alors injecter une passkey précédemment enregistrée pour Cloudity.
  // Best-effort : silencieux si le browser ne supporte pas (Firefox <119),
  // ne casse jamais le login mot de passe.
  const conditionalAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!isWebAuthnSupported()) return
    const ac = new AbortController()
    conditionalAbortRef.current = ac
    let cancelled = false
    ;(async () => {
      try {
        const res = await loginWithPasskeyDiscoverable('1', ac.signal)
        if (cancelled || !res) return
        finishLogin(res.access_token, res.refresh_token, res.email)
        toast.success('Connexion passkey réussie')
      } catch {
        // Silencieux : on continue à proposer le login mot de passe.
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connexion passkey explicite : tente d'abord une passkey discoverable sans
  // email, puis garde le fallback non-discoverable si un email est déjà connu.
  const handlePasskeyLogin = async () => {
    conditionalAbortRef.current?.abort()
    conditionalAbortRef.current = null
    setLoading(true)
    try {
      const discoverable = await loginWithPasskeyDiscoverable('1', undefined, false)
      if (discoverable) {
        finishLogin(discoverable.access_token, discoverable.refresh_token, discoverable.email)
        toast.success('Connexion passkey réussie')
        return
      }
      if (!normalizedEmail) {
        toast.error('Aucune passkey disponible. Saisis ton email pour continuer.')
        return
      }
      const res = await loginWithPasskey(normalizedEmail, '1')
      finishLogin(res.access_token, res.refresh_token, normalizedEmail)
      toast.success('Connexion passkey réussie')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur passkey')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-slate-900 px-4 py-12">
      <div className="w-full max-w-[400px]">
        {/* Logo + titre */}
        <div className="text-center mb-8">
          <Link
            to="/"
            className="inline-block text-2xl font-semibold text-gray-900 dark:text-slate-100 tracking-tight hover:text-gray-700 dark:hover:text-slate-300"
          >
            Cloudity
          </Link>
          <h1 className="mt-3 text-lg font-medium text-gray-600 dark:text-slate-400">
            Connexion
          </h1>
        </div>

        {/* Carte formulaire */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-600 shadow-sm p-8">
          {loginError && !twoFAStep ? (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3.5 py-3 text-sm text-red-800 dark:text-red-200"
            >
              {loginError}
            </div>
          ) : null}
          {twoFAStep ? (
            <form onSubmit={handle2FASubmit} className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <ShieldCheck className="w-5 h-5" />
                <span>Authentification à 2 facteurs requise</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-400">
                Saisis le code à 6 chiffres de ton authenticator (Google Authenticator,
                1Password, Authy, …) ou un code de récupération <code className="text-[11px]">XXXX-XXXX-XXXX</code>.
              </p>
              <div>
                <label htmlFor="twofa" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Code 2FA ou de récupération
                </label>
                <input
                  id="twofa"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value)}
                  required
                  placeholder="123456 ou XXXX-XXXX-XXXX"
                  autoFocus
                  className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 py-2.5 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? 'Vérification…' : 'Valider'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFAStep(false)
                  setTwoFACode('')
                }}
                disabled={loading}
                className="mt-2 w-full text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700"
              >
                ← Recommencer
              </button>
            </form>
          ) : step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // `username webauthn` : déclenche la Conditional UI quand
                // une passkey discoverable est dispo dans le browser/PM
                // tiers (Proton Pass, iCloud Keychain, Bitwarden).
                autoComplete="username webauthn"
                required
                placeholder="vous@exemple.com"
                className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 py-2.5 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:pointer-events-none"
            >
              Continuer
            </button>
          </form>
          ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 px-3.5 py-2.5">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Compte</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-slate-100">{normalizedEmail}</p>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setPassword('')
                }}
                disabled={loading}
                className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50"
              >
                Changer d’email
              </button>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                autoFocus
                className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 py-2.5 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
          )}

          {!twoFAStep && isWebAuthnSupported() && (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              Utiliser une passkey
            </button>
          )}

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-slate-400">
            Pas de compte ?{' '}
            <Link to="/register" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
              Créer un compte
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center">
          <Link to="/" className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
            ← Retour à l’accueil
          </Link>
        </p>
      </div>
    </div>
  )
}
