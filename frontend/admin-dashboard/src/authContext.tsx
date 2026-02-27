import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { refreshAuth } from './api'

const STORAGE_KEY = 'cloudity_admin_auth'

export type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  tenantId: number | null
  email: string | null
}

const defaultState: AuthState = {
  accessToken: null,
  refreshToken: null,
  tenantId: null,
  email: null,
}

function loadFromStorage(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const data = JSON.parse(raw) as AuthState
    if (data.accessToken && data.tenantId != null) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        tenantId: data.tenantId,
        email: data.email ?? null,
      }
    }
  } catch {
    // ignore
  }
  return defaultState
}

function saveToStorage(state: AuthState): void {
  if (state.accessToken && state.tenantId != null) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

type AuthContextValue = AuthState & {
  isAuthenticated: boolean
  login: (accessToken: string, refreshToken: string | undefined, tenantId: number, email: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(loadFromStorage)
  const navigate = useNavigate()
  const refreshTokenRef = useRef<string | null>(null)
  refreshTokenRef.current = state.refreshToken

  useEffect(() => {
    saveToStorage(state)
  }, [state])

  // Rafraîchissement proactif : toutes les 10 min tant qu'on a un refresh token, pour garder la session sans déconnexion
  useEffect(() => {
    if (!state.refreshToken || !state.accessToken || state.tenantId == null) return
    const intervalMs = 10 * 60 * 1000 // 10 minutes
    const id = setInterval(async () => {
      const rt = refreshTokenRef.current
      if (!rt) return
      try {
        const res = await refreshAuth(rt)
        setState((prev) => ({
          ...prev,
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
        }))
      } catch {
        // En cas d'échec (ex. refresh révoqué), on ne déconnecte pas tout de suite ; le prochain 401 fera logout
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [state.refreshToken, state.accessToken, state.tenantId])

  const login = useCallback(
    (accessToken: string, refreshToken: string | undefined, tenantId: number, email: string) => {
      setState({
        accessToken,
        refreshToken: refreshToken ?? null,
        tenantId,
        email,
      })
      // Redirect is handled by the page (e.g. /app or /admin)
    },
    []
  )

  const logout = useCallback(() => {
    setState(defaultState)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.accessToken && state.tenantId != null),
      login,
      logout,
    }),
    [state, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Déconnecte et redirige vers /login quand une requête API renvoie 401 (token invalide ou expiré).
 * Tente d'abord un refresh avec le refresh token pour garder la session. */
export function Global401Handler() {
  const { logout, isAuthenticated, refreshToken, login, tenantId, email } = useAuth()
  const queryClient = useQueryClient()
  const triedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    const cache = queryClient.getQueryCache()
    const unsub = cache.subscribe((event) => {
      if (event?.type !== 'updated') return
      const q = event.query
      if (q.state.status !== 'error' || !(q.state.error instanceof Error)) return
      if (!String(q.state.error.message).includes('401')) return

      const tryRefresh = async () => {
        if (!refreshToken || triedRef.current) {
          toast.error('Session expirée ou token invalide. Reconnectez-vous.')
          logout()
          return
        }
        triedRef.current = true
        try {
          const res = await refreshAuth(refreshToken)
          login(res.access_token, res.refresh_token, tenantId!, email ?? '')
          queryClient.invalidateQueries()
          triedRef.current = false // permettre un nouveau refresh au prochain 401
        } catch {
          triedRef.current = false
          toast.error('Session expirée. Reconnectez-vous.')
          logout()
        }
      }
      tryRefresh()
    })
    return () => unsub()
  }, [queryClient, logout, isAuthenticated, refreshToken, login, tenantId, email])

  return null
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
