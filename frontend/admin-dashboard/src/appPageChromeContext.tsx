import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type AppPageChromeContextValue = {
  /** Contenu affiché à côté du fil d’Ariane (menu d’app : Mail, Calendar, …). */
  breadcrumbActions: React.ReactNode | null
  setBreadcrumbActions: (node: React.ReactNode | null) => void
  /** Contenu affiché juste avant la recherche globale (ex. bouton synchro Mail). */
  shellSearchAdjacent: React.ReactNode | null
  setShellSearchAdjacent: (node: React.ReactNode | null) => void
}

const AppPageChromeContext = createContext<AppPageChromeContextValue | null>(null)

export function AppPageChromeProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbActions, setBreadcrumbActionsState] = useState<React.ReactNode | null>(null)
  const [shellSearchAdjacent, setShellSearchAdjacentState] = useState<React.ReactNode | null>(null)
  const setBreadcrumbActions = useCallback((node: React.ReactNode | null) => {
    setBreadcrumbActionsState(node)
  }, [])
  const setShellSearchAdjacent = useCallback((node: React.ReactNode | null) => {
    setShellSearchAdjacentState(node)
  }, [])
  const value = useMemo(
    () => ({ breadcrumbActions, setBreadcrumbActions, shellSearchAdjacent, setShellSearchAdjacent }),
    [breadcrumbActions, setBreadcrumbActions, shellSearchAdjacent, setShellSearchAdjacent]
  )
  return <AppPageChromeContext.Provider value={value}>{children}</AppPageChromeContext.Provider>
}

/** Sous AppLayout uniquement ; hors provider (tests unitaires) → `null`. */
export function useOptionalAppPageChrome(): AppPageChromeContextValue | null {
  return useContext(AppPageChromeContext)
}

/** Emplacement réservé dans la barre du haut (AppLayout), après le fil d’Ariane. */
export function BreadcrumbAppActionsSlot() {
  const ctx = useContext(AppPageChromeContext)
  if (!ctx?.breadcrumbActions) return null
  return (
    <div className="flex items-center shrink-0 border-l border-gray-200 dark:border-slate-600 pl-2 ml-1 min-h-[2rem]">
      {ctx.breadcrumbActions}
    </div>
  )
}

/** Emplacement avant la palette de recherche (barre du haut AppLayout). */
export function ShellSearchAdjacentSlot() {
  const ctx = useContext(AppPageChromeContext)
  if (!ctx?.shellSearchAdjacent) return null
  return <div className="flex items-center shrink-0 mr-0.5">{ctx.shellSearchAdjacent}</div>
}
