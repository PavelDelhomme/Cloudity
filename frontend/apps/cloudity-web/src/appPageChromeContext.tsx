import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

/** Contenu affiché dans la barre (fil d’Ariane, zone recherche) — seul ce contexte change quand le chrome est mis à jour. */
export type AppPageChromeDisplayValue = {
  breadcrumbActions: React.ReactNode | null
  shellSearchAdjacent: React.ReactNode | null
}

/** Setters stables : les pages qui enregistrent le chrome s’y abonnent sans re-rendu quand le nœud affiché change. */
export type AppPageChromeSettersValue = {
  setBreadcrumbActions: (node: React.ReactNode | null) => void
  setShellSearchAdjacent: (node: React.ReactNode | null) => void
}

const AppPageChromeDisplayContext = createContext<AppPageChromeDisplayValue | null>(null)
const AppPageChromeSettersContext = createContext<AppPageChromeSettersValue | null>(null)

export function AppPageChromeProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbActions, setBreadcrumbActionsState] = useState<React.ReactNode | null>(null)
  const [shellSearchAdjacent, setShellSearchAdjacentState] = useState<React.ReactNode | null>(null)
  const setBreadcrumbActions = useCallback((node: React.ReactNode | null) => {
    setBreadcrumbActionsState(node)
  }, [])
  const setShellSearchAdjacent = useCallback((node: React.ReactNode | null) => {
    setShellSearchAdjacentState(node)
  }, [])
  const settersValue = useMemo(
    () => ({ setBreadcrumbActions, setShellSearchAdjacent }),
    [setBreadcrumbActions, setShellSearchAdjacent]
  )
  const displayValue = useMemo(
    () => ({ breadcrumbActions, shellSearchAdjacent }),
    [breadcrumbActions, shellSearchAdjacent]
  )
  return (
    <AppPageChromeSettersContext.Provider value={settersValue}>
      <AppPageChromeDisplayContext.Provider value={displayValue}>{children}</AppPageChromeDisplayContext.Provider>
    </AppPageChromeSettersContext.Provider>
  )
}

/** Sous `AppPageChromeProvider` uniquement ; hors provider (tests) → `null`. */
export function useAppPageChromeSetters(): AppPageChromeSettersValue | null {
  return useContext(AppPageChromeSettersContext)
}

/**
 * Contexte d’affichage uniquement. Pour pousser du chrome depuis une page, préférer `useAppPageChromeSetters`
 * afin d’éviter de se ré-abonner à chaque changement de `breadcrumbActions`.
 */
export function useOptionalAppPageChrome(): AppPageChromeDisplayValue | null {
  return useContext(AppPageChromeDisplayContext)
}

/** Emplacement réservé dans la barre du haut (AppLayout), après le fil d’Ariane. */
export function BreadcrumbAppActionsSlot() {
  const ctx = useContext(AppPageChromeDisplayContext)
  if (!ctx?.breadcrumbActions) return null
  return (
    <div className="flex items-center shrink-0 border-l border-gray-200 dark:border-slate-600 pl-2 ml-1 min-h-[2rem]">
      {ctx.breadcrumbActions}
    </div>
  )
}

/** Emplacement avant la palette de recherche (barre du haut AppLayout). */
export function ShellSearchAdjacentSlot() {
  const ctx = useContext(AppPageChromeDisplayContext)
  if (!ctx?.shellSearchAdjacent) return null
  return <div className="flex items-center min-w-0">{ctx.shellSearchAdjacent}</div>
}
