/**
 * useSecurePaths — résout les chemins SPA rotatifs émis par le backend
 * (`GET /auth/security-paths`, cf. `backend/auth-service/securetoken.go`).
 *
 * Modèle « **capability URLs** » : chaque page sensible (réglages 2FA,
 * codes de récupération, passkeys de l'utilisateur) est exposée derrière
 * un slug HMAC dérivé de `(user_id, purpose, epoch 30 j)`. Le slug est
 * recalculé côté serveur et non devinable. Si l'URL fuit (capture d'écran,
 * historique, partage de tab), elle limite surtout les **fuites passives**
 * à long terme (réutilisation différée sans JWT). Un attaquant actif avec
 * slug + JWT valide exploite tout de suite — cf. docs/securite/URL-CAPABILITIES.md § 2.2.
 *
 * Stratégie de cache :
 *  - React Query `staleTime` 30 min, `gcTime` 1 h — requêtes rares si pas d’échéance proche.
 *  - Re-fetch **proactif** : `useEffect` + `invalidateQueries` à
 *    `rotates_at - 5 min` (cf. **UC-FE-01** / URL-CAPABILITIES § 2.4) pour
 *    éviter un slug SPA obsolète sans attendre seulement `staleTime`.
 *  - On ne stocke JAMAIS le slug dans `localStorage` / `sessionStorage` —
 *    il vit uniquement dans la cache React Query (= en mémoire).
 *  - En cas d'erreur 503 (`URL_TOKEN_SECRET` absent côté serveur), on
 *    retombe silencieusement sur le chemin canonique `/app/settings`
 *    (aucune régression UX, simple perte du slug rotatif).
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurePaths, type SecurePathsResponse } from '../../../api'
import { useAuth } from '../../../authContext'

/** Chemin canonique vers la page Sécurité — repli si le rotatif n'est pas dispo. */
export const CANONICAL_SETTINGS_SECURITY = '/app/settings'

export interface UseSecurePathsResult {
  /** Chemin rotatif vers les réglages Sécurité (passkeys + 2FA + recovery). */
  settingsSecurity: string
  /** True quand le chemin rotatif a été obtenu (sinon = repli canonique). */
  isRotated: boolean
  /** True pendant le premier chargement (avant repli canonique). */
  isLoading: boolean
  /** Erreur réseau hors 401/403/503 (qui sont gérées en repli silencieux). */
  error: unknown
  /** Réponse brute si on en a besoin pour debug. */
  raw: SecurePathsResponse | undefined
}

/** Marge avant `rotates_at` pour invalider le cache (slug frais avant rejet serveur). */
const REFETCH_BEFORE_ROTATE_MS = 5 * 60 * 1000

export function useSecurePaths(): UseSecurePathsResult {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const query = useQuery<SecurePathsResponse>({
    queryKey: ['security-paths'],
    enabled: !!accessToken,
    queryFn: () => fetchSecurePaths(accessToken!),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      // 503 (secret manquant) → on ne réessaie pas, on bascule sur canonique.
      const msg = (err as Error)?.message ?? ''
      if (msg.includes('503')) return false
      return failureCount < 1
    },
  })

  const rotatesAt = query.data?.paths?.settings_security?.rotates_at
  useEffect(() => {
    if (!accessToken || !rotatesAt) return
    const rotateMs = Date.parse(rotatesAt)
    if (Number.isNaN(rotateMs)) return
    const delayMs = Math.max(0, rotateMs - REFETCH_BEFORE_ROTATE_MS - Date.now())
    const id = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['security-paths'] })
    }, delayMs)
    return () => window.clearTimeout(id)
  }, [accessToken, rotatesAt, queryClient])

  const entry = query.data?.paths?.settings_security
  return {
    settingsSecurity: entry?.path ?? CANONICAL_SETTINGS_SECURITY,
    isRotated: !!entry,
    isLoading: query.isLoading,
    error: query.error,
    raw: query.data,
  }
}
