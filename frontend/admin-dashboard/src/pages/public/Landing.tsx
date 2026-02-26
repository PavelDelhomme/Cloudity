import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { Navigate } from 'react-router-dom'

export default function Landing() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">Cloudity</span>
          <nav className="flex items-center gap-6">
            <Link to="/login" className="text-gray-700 hover:text-gray-900">
              Connexion
            </Link>
            <Link
              to="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
            >
              Créer un compte
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-semibold text-gray-900">
          Votre cloud privé et chiffré
        </h1>
        <p className="mt-4 text-gray-600 text-lg">
          Mail, stockage, mots de passe — auto-hébergé, sous votre contrôle.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            to="/register"
            className="bg-blue-600 text-white px-5 py-2.5 rounded text-base font-medium hover:bg-blue-700"
          >
            Démarrer
          </Link>
          <Link
            to="/login"
            className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded text-base font-medium hover:bg-gray-50"
          >
            Se connecter
          </Link>
        </div>

        <ul className="mt-16 space-y-2 text-gray-600">
          <li><strong className="text-gray-900">Drive</strong> — Fichiers et dossiers chiffrés</li>
          <li><strong className="text-gray-900">Pass</strong> — Gestionnaire de mots de passe</li>
          <li><strong className="text-gray-900">Mail</strong> — Boîte mail et alias</li>
        </ul>
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
          © Cloudity — Auto-hébergé, open source
        </div>
      </footer>
    </div>
  )
}
