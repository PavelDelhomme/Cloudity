import React from 'react'
import { accessTokenHasAdminRole } from '@cloudity/shared'
import { useAuth } from './authContext'

/**
 * Accès back-office : vérifie JWT + claim rôle admin (aligné gateway).
 * Navigation pleine page vers /login ou /app si le bundle admin est chargé sans session utilisable.
 */
export function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken } = useAuth()

  if (!isAuthenticated || !accessToken) {
    if (typeof window !== 'undefined') {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.location.replace(`/login?next=${next}`)
    }
    return (
      <div className="p-6 text-sm text-slate-600 dark:text-slate-400">
        Redirection vers la connexion…
      </div>
    )
  }

  if (!accessTokenHasAdminRole(accessToken)) {
    if (typeof window !== 'undefined') {
      window.location.replace('/app')
    }
    return (
      <div className="p-6 text-sm text-slate-600 dark:text-slate-400">
        Accès réservé aux administrateurs.
      </div>
    )
  }

  return <>{children}</>
}
