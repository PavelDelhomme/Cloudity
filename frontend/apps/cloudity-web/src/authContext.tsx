/* @refresh reset */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import { AUTH_STORAGE_KEY as STORAGE_KEY, ApiError, isAccessTokenUsable } from '@cloudity/shared'
import { AuthContext, type AuthContextValue, type AuthState } from './authContextStore'
import { refreshSessionExclusive } from './authSessionRefresh'

export type { AuthContextValue, AuthState } from './authContextStore'

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

function applyAuthState(
  next: AuthState,
  setState: React.Dispatch<React.SetStateAction<AuthState>>,
  accessTokenRef: React.MutableRefObject<string | null>,
  refreshTokenRef: React.MutableRefObject<string | null>
): void {
  accessTokenRef.current = next.accessToken
  refreshTokenRef.current = next.refreshToken
  try {
    saveToStorage(next)
  } catch {
    /* storage saturé */
  }
  setState(next)
}

function needsSessionBootstrap(state: AuthState): boolean {
  if (!state.accessToken || state.tenantId == null) return false
  return !isAccessTokenUsable(state.accessToken)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(loadFromStorage)
  const [sessionReady, setSessionReady] = useState(() => !needsSessionBootstrap(loadFromStorage()))
  const navigate = useNavigate()
  const refreshTokenRef = useRef<string | null>(null)
  refreshTokenRef.current = state.refreshToken
  const accessTokenRef = useRef<string | null>(null)
  accessTokenRef.current = state.accessToken

  const refreshAccessTokenIfNeeded = useCallback(async (options?: { force?: boolean }): Promise<string | null> => {
    const next = await refreshSessionExclusive(options)
    if (next) {
      // flushSync : les queryFn invalidées par Global401Handler doivent voir le nouveau JWT
      // dans le même tick (sinon boucle 401).
      flushSync(() => {
        applyAuthState(next, setState, accessTokenRef, refreshTokenRef)
      })
      return next.accessToken
    }
    return null
  }, [])

  useEffect(() => {
    saveToStorage(state)
  }, [state])

  // Sync cross-onglets / cross-bundles (index.html ↔ admin.html) après rotation du refresh token.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const data = JSON.parse(event.newValue) as AuthState
        if (data.accessToken && data.tenantId != null) {
          applyAuthState(data, setState, accessTokenRef, refreshTokenRef)
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Rafraîchissement proactif : toutes les 10 min (JWT d’accès souvent 60 min ; refresh token 30 j + rotation).
  useEffect(() => {
    if (!state.refreshToken || !state.accessToken || state.tenantId == null) return
    const intervalMs = 10 * 60 * 1000
    const id = setInterval(() => {
      void refreshAccessTokenIfNeeded()
    }, intervalMs)
    return () => clearInterval(id)
  }, [state.refreshToken, state.accessToken, state.tenantId, refreshAccessTokenIfNeeded])

  const lastFocusRefreshAtRef = useRef(0)

  useEffect(() => {
    if (!state.refreshToken || !state.accessToken || state.tenantId == null) return
    const doRefresh = () => {
      const now = Date.now()
      if (now - lastFocusRefreshAtRef.current < 5000) return
      lastFocusRefreshAtRef.current = now
      void refreshAccessTokenIfNeeded()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      doRefresh()
    }
    const onFocus = () => doRefresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [state.refreshToken, state.accessToken, state.tenantId, refreshAccessTokenIfNeeded])

  const lastActivityRefreshAtRef = useRef(0)

  useEffect(() => {
    if (!state.refreshToken || !state.accessToken || state.tenantId == null) return
    const minGapMs = 4 * 60 * 1000
    const onActivity = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastActivityRefreshAtRef.current < minGapMs) return
      if (now - lastFocusRefreshAtRef.current < 5000) return
      lastActivityRefreshAtRef.current = now
      lastFocusRefreshAtRef.current = now
      void refreshAccessTokenIfNeeded()
    }
    document.addEventListener('pointerdown', onActivity, { passive: true })
    document.addEventListener('keydown', onActivity)
    return () => {
      document.removeEventListener('pointerdown', onActivity)
      document.removeEventListener('keydown', onActivity)
    }
  }, [state.refreshToken, state.accessToken, state.tenantId, refreshAccessTokenIfNeeded])

  const login = useCallback(
    (accessToken: string, refreshToken: string | undefined, tenantId: number, email: string) => {
      const next: AuthState = {
        accessToken,
        refreshToken: refreshToken ?? null,
        tenantId,
        email,
      }
      applyAuthState(next, setState, accessTokenRef, refreshTokenRef)
      setSessionReady(true)
    },
    []
  )

  const logout = useCallback(() => {
    setState(defaultState)
    accessTokenRef.current = null
    refreshTokenRef.current = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    const returnTo =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '/app'
    const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/4dm1n')) {
      window.location.replace(loginUrl)
      return
    }
    navigate(loginUrl, { replace: true, state: { returnTo } })
  }, [navigate])

  // Au rechargement : si le JWT d’accès est expiré, refresh avant que Mail/Theme/etc. tirent des requêtes.
  useEffect(() => {
    if (sessionReady) return
    let cancelled = false
    ;(async () => {
      const token = await refreshAccessTokenIfNeeded({ force: true })
      if (cancelled) return
      if (!token) {
        logout()
      }
      setSessionReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionReady, refreshAccessTokenIfNeeded, logout])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.accessToken && state.tenantId != null),
      sessionReady,
      login,
      logout,
      refreshAccessTokenIfNeeded,
    }),
    [state, sessionReady, login, logout, refreshAccessTokenIfNeeded]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Déconnecte et redirige vers /login quand une requête API renvoie 401 (token invalide ou expiré).
 * Tente d'abord un refresh avec le refresh token pour garder la session. */
export function Global401Handler() {
  const { logout, isAuthenticated, refreshAccessTokenIfNeeded } = useAuth()
  const queryClient = useQueryClient()
  const triedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    const cache = queryClient.getQueryCache()
    const unsub = cache.subscribe((event) => {
      if (event?.type !== 'updated') return
      const q = event.query
      if (q.state.status !== 'error' || !(q.state.error instanceof Error)) return
      const err = q.state.error
      const isUnauthorized =
        (err instanceof ApiError && err.status === 401) ||
        String(err.message).includes('401')
      if (!isUnauthorized) return

      const tryRefresh = async () => {
        if (triedRef.current) return
        triedRef.current = true
        try {
          const token = await refreshAccessTokenIfNeeded({ force: true })
          if (!token) {
            toast.error('Session expirée. Reconnectez-vous.')
            logout()
            return
          }
          queryClient.invalidateQueries()
        } finally {
          triedRef.current = false
        }
      }
      void tryRefresh()
    })
    return () => unsub()
  }, [queryClient, logout, isAuthenticated, refreshAccessTokenIfNeeded])

  return null
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
