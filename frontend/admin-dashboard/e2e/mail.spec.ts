import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Mail (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('affiche la page Mail et charge les comptes (pas de 404)', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page).toHaveURL(/\/app\/mail/)
    // Titre Mail visible = page chargée (pas 404)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    // Contenu attendu : section Boîtes mail, bouton ajouter, ou chargement / erreur
    await expect(
      page.getByText(/Boîtes mail|Menu Mail|Chargement des comptes|service Mail ne répond pas/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('clic sur Mail dans le hub ouvre la page Mail', async ({ page }) => {
    await page.getByRole('link', { name: 'Mail' }).first().click()
    await expect(page).toHaveURL(/\/app\/mail/)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible()
  })

  test('page Mail affiche une section ou un bouton pour les boîtes', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/boîtes|ajouter|mail/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('page Mail : fil d’Ariane ou lien tableau de bord présent', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: /tableau de bord|Tableau de bord/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('page Mail : pas d’erreur réseau visible au chargement', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/erreur 500|failed to fetch|network error/i)).not.toBeVisible({ timeout: 3000 })
  })

  /** Non-régression AppPageChrome / MailPage — voir docs/TESTS.md § 4.8 */
  test('navigation Mail ↔ Drive — pas de Maximum update depth (console / pageerror)', async ({ page }) => {
    const depthLoop: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (t.includes('Maximum update depth')) depthLoop.push(`console[${msg.type()}]: ${t}`)
    })
    page.on('pageerror', (err) => {
      if (err.message.includes('Maximum update depth')) depthLoop.push(`pageerror: ${err.message}`)
    })

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(600)

    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(400)

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(600)

    expect(depthLoop).toEqual([])
  })
})
