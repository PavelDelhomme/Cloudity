import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { login as apiLogin } from '../../api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const nextParam = new URLSearchParams(location.search).get('next')
  const stateReturnTo = (location.state as { returnTo?: string })?.returnTo
  const rawReturn = nextParam ?? stateReturnTo ?? '/app'
  const returnTo = rawReturn.startsWith('/app') || rawReturn.startsWith('/admin') ? rawReturn : '/app'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Email et mot de passe requis')
      return
    }
    setLoading(true)
    try {
      const res = await apiLogin({ email: email.trim(), password })
      if (res.requires_2fa) {
        toast.error('Connexion 2FA : non gérée depuis cette page pour l’instant')
        return
      }
      setAuth(res.access_token, res.refresh_token ?? undefined, 1, email.trim())
      toast.success('Connexion réussie')
      navigate(returnTo, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de connexion')
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
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="vous@exemple.com"
                className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 py-2.5 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              />
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
