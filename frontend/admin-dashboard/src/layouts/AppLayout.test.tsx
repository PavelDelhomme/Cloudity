import { describe, it, expect } from 'vitest'
import { getAppBreadcrumb } from './AppLayout'

describe('getAppBreadcrumb', () => {
  it('sur l’éditeur renvoie Tableau de bord > Drive (pas Office ni Éditeur)', () => {
    const segments = getAppBreadcrumb('/app/office/editor/1')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: 'Tableau de bord', href: '/app' })
    expect(segments[1]).toEqual({ label: 'Drive', href: '/app/drive' })
    expect(segments.some((s) => s.label === 'Office')).toBe(false)
    expect(segments.some((s) => s.label === 'Éditeur')).toBe(false)
  })

  it('sur /app/drive renvoie Tableau de bord > Drive', () => {
    const segments = getAppBreadcrumb('/app/drive')
    expect(segments[0].label).toBe('Tableau de bord')
    expect(segments[1].label).toBe('Drive')
    expect(segments).toHaveLength(2)
  })

  it('sur /app/drive avec view=trash renvoie Tableau de bord > Drive > Corbeille', () => {
    const segments = getAppBreadcrumb('/app/drive', 'view=trash')
    expect(segments[0].label).toBe('Tableau de bord')
    expect(segments[1].label).toBe('Drive')
    expect(segments[2].label).toBe('Corbeille')
    expect(segments[2].href).toBe('/app/drive?view=trash')
  })

  it('sur /app/corbeille renvoie Tableau de bord > Drive > Corbeille', () => {
    const segments = getAppBreadcrumb('/app/corbeille')
    expect(segments).toHaveLength(3)
    expect(segments[1].label).toBe('Drive')
    expect(segments[2].label).toBe('Corbeille')
  })

  it('sur /app renvoie uniquement Tableau de bord', () => {
    const segments = getAppBreadcrumb('/app')
    expect(segments).toHaveLength(1)
    expect(segments[0].label).toBe('Tableau de bord')
  })
})
