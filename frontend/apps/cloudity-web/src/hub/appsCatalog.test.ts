import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  HUB_LAUNCHER_APPS,
  HUB_INVENTORY_ROUTES,
  hubAppsByCategory,
} from './appsCatalog'

describe('appsCatalog (FE-HUB-01 inventaire)', () => {
  it('liste les 11 apps launcher avec href /app/*', () => {
    expect(HUB_LAUNCHER_APPS).toHaveLength(11)
    for (const app of HUB_LAUNCHER_APPS) {
      expect(app.href.startsWith('/app/')).toBe(true)
    }
  })

  it('inventaire routes couvre Drive → Photos + settings', () => {
    const ids = HUB_INVENTORY_ROUTES.map((r) => r.id)
    expect(ids).toContain('mail')
    expect(ids).toContain('drive')
    expect(ids).toContain('settings')
    expect(HUB_INVENTORY_ROUTES.find((r) => r.id === 'mail')?.href).toBe('/app/mail/')
  })

  it('groupement par catégories non vide', () => {
    const sections = hubAppsByCategory()
    expect(sections.length).toBeGreaterThanOrEqual(5)
    expect(sections.some((s) => s.category === 'Communication')).toBe(true)
  })
})

describe('AppHub source (pas de métier)', () => {
  it('n’importe ni api ni react-query', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/app/hub/AppHub.tsx'),
      'utf8'
    )
    expect(src).not.toMatch(/useQuery|useQueries/)
    expect(src).not.toMatch(/from ['"].*\/api['"]/)
    expect(src).not.toMatch(/fetchMail|fetchDrive|fetchCalendar/)
  })
})
