import type { Page } from '@playwright/test'

const AUTH_KEY = 'cloudity_admin_auth'

/** URL du **gateway** (JWT + `/pass/*`), pas le dashboard. Défaut aligné sur `docker-compose` + Vite dev. */
function apiBase(): string {
  return (
    process.env.PLAYWRIGHT_API_URL?.replace(/\/$/, '') ||
    process.env.VITE_API_URL?.replace(/\/$/, '') ||
    'http://localhost:6080'
  )
}

type VaultRow = { id: number; name: string }

/**
 * Supprime via l’API tous les coffres dont le nom commence par `e2e-` (insensible à la casse).
 * À appeler depuis `afterEach` des specs Pass — nécessite un token en localStorage (après login).
 */
export async function cleanupPassE2EVaultsFromPage(page: Page): Promise<void> {
  const token = await page.evaluate((key) => {
    try {
      const r = localStorage.getItem(key)
      if (!r) return null
      const j = JSON.parse(r) as { access_token?: string }
      return j.access_token ?? null
    } catch {
      return null
    }
  }, AUTH_KEY)
  if (!token) return

  const base = apiBase()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }

  const listRes = await fetch(`${base}/pass/vaults`, { headers })
  if (!listRes.ok) return

  let vaults: VaultRow[] = []
  try {
    vaults = (await listRes.json()) as VaultRow[]
  } catch {
    return
  }
  if (!Array.isArray(vaults)) return

  for (const v of vaults) {
    if (typeof v?.name !== 'string' || typeof v?.id !== 'number') continue
    if (!v.name.toLowerCase().startsWith('e2e-')) continue
    await fetch(`${base}/pass/vaults/${v.id}`, { method: 'DELETE', headers })
  }
}
