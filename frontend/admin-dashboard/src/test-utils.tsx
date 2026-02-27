import React from 'react'
import { MemoryRouter } from 'react-router-dom'

/** Options future React Router pour supprimer les warnings v7 dans les tests. */
export const routerFuture = { v7_startTransition: true as const, v7_relativeSplatPath: true as const }

/** MemoryRouter avec future flags pour les tests. */
export function TestRouter(
  props: React.ComponentProps<typeof MemoryRouter>
) {
  return <MemoryRouter {...props} future={routerFuture} />
}
