import { createContext } from 'react'

/** État persisté (localStorage) — module stable pour éviter la recréation du contexte au HMR Vite. */
export type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  tenantId: number | null
  email: string | null
}

export type AuthContextValue = AuthState & {
  isAuthenticated: boolean
  login: (accessToken: string, refreshToken: string | undefined, tenantId: number, email: string) => void
  logout: () => void
  /** Si le JWT d’accès expire bientôt, tente un refresh (dédupliqué) avant syncs batch / IMAP. */
  refreshAccessTokenIfNeeded: (options?: { force?: boolean }) => Promise<string | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
