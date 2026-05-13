/**
 * SettingsRedirect — `/app/settings` canonique. Tente de récupérer un slug
 * SPA rotatif via `/auth/security-paths` puis redirige vers
 * `/app/settings/sec/:token`. En cas d'indisponibilité serveur (503 :
 * `URL_TOKEN_SECRET` absent), tombe en repli sur `/app/settings/canonical`
 * pour ne pas casser l'UX.
 *
 * Pourquoi pas une simple `<Navigate>` ? Parce qu'on a besoin du `useQuery`
 * sous-jacent dans `useSecurePaths` (cache 30 min, re-fetch après
 * `rotates_at - 5 min`).
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useSecurePaths, CANONICAL_SETTINGS_SECURITY } from './useSecurePaths'

export default function SettingsRedirect() {
  const { settingsSecurity, isRotated, isLoading } = useSecurePaths()

  // Pendant le chargement initial, on évite le flash en montrant un
  // loader minimaliste (20-200 ms en pratique).
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-500" role="status" aria-live="polite">
        <span className="animate-pulse">Chargement…</span>
      </div>
    )
  }

  if (isRotated) {
    return <Navigate to={settingsSecurity} replace />
  }

  // Repli silencieux : URL_TOKEN_SECRET absent côté serveur ou erreur
  // réseau. On redirige sur la page non-obfusquée pour que les Settings
  // restent accessibles. Voir `URL-CAPABILITIES.md` § 5 pour la matrice
  // de mode dégradé.
  return <Navigate to={`${CANONICAL_SETTINGS_SECURITY}/canonical`} replace />
}
