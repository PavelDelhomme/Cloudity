import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

  useEffect(() => {
    saveToStorage(state)
  }, [state])

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
