import { test, expect } from '@playwright/test'
import { login, DEMO_EMAIL, DEMO_PASSWORD } from './fixtures/auth'

/**
 * Smoke E2E /4dm1n — connexion admin → ouverture du back-office.
 *
 * Prérequis :
 *   make up
 *   make seed-admin   # crée + promeut admin@cloudity.local en role='admin'
 *
 * Lancement :
 *   BASE_URL=http://localhost:6001 npx playwright test e2e/admin.spec.ts
 *
 * Le compte de démo est celui créé par **`make seed-admin`** ; surcharge possible via
 * **`PLAYWRIGHT_E2E_*`** pour rester aligné avec **`auth.spec.ts`** (mot de passe : Makefile / scripts db, pas dans la doc).
 */

test.describe('Back-office admin (/4dm1n)', () => {
  test('redirige /4dm1n vers /login si non authentifié', async ({ page }) => {
    await page.goto('/4dm1n')
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 })
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15_000 })
  })

  test('connexion admin via ?next=/4dm1n ouvre le back-office', async ({ page }) => {
    await login(page, { email: DEMO_EMAIL, password: DEMO_PASSWORD, returnTo: '/4dm1n' })
    await expect(page).toHaveURL(/\/4dm1n(\/|$)/, { timeout: 20_000 })
    await expect(page.getByRole('link', { name: /tenants/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /utilisateurs/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /domaines mail/i })).toBeVisible()
  })

  test('navigation latérale : Logs mobile', async ({ page }) => {
    await login(page, { email: DEMO_EMAIL, password: DEMO_PASSWORD, returnTo: '/4dm1n' })
    await expect(page).toHaveURL(/\/4dm1n(\/|$)/, { timeout: 20_000 })

    await page.getByRole('link', { name: /logs mobile/i }).click()
    await expect(page).toHaveURL(/\/4dm1n\/mobile-logs/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /logs mobile/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /actualiser/i })).toBeVisible()
  })
})
