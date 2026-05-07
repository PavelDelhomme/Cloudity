import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { Navigate } from 'react-router-dom'

export default function Landing() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <header className="border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900 dark:text-slate-100">Cloudity</span>
          <nav className="flex items-center gap-6">
            <Link to="/login" className="text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white">
              Connexion
            </Link>
            <Link
              to="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Créer un compte
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-slate-100">
          Votre cloud privé et chiffré
        </h1>
        <p className="mt-4 text-gray-600 dark:text-slate-400 text-lg">
          Mail, stockage, mots de passe — auto-hébergé, sous votre contrôle.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            to="/register"
            className="bg-blue-600 text-white px-5 py-2.5 rounded text-base font-medium hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Démarrer
          </Link>
          <Link
            to="/login"
            className="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-5 py-2.5 rounded text-base font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Se connecter
          </Link>
        </div>

        <ul className="mt-16 space-y-2 text-gray-600 dark:text-slate-400">
          <li><strong className="text-gray-900 dark:text-slate-100">Drive</strong> — Fichiers et dossiers chiffrés</li>
          <li><strong className="text-gray-900 dark:text-slate-100">Pass</strong> — Gestionnaire de mots de passe</li>
          <li><strong className="text-gray-900 dark:text-slate-100">Mail</strong> — Boîte mail et alias</li>
        </ul>
      </main>

      <footer className="border-t border-gray-200 dark:border-slate-700 mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-slate-400">
          © Cloudity — Auto-hébergé, open source
        </div>
      </footer>
    </div>
  )
}
