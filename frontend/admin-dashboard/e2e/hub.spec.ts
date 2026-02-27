import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Hub (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('affiche le tableau de bord avec les cartes Drive et Office', async ({ page }) => {
    await expect(page).toHaveURL(/\/(app|app\/)$/)
    await expect(page.getByRole('link', { name: 'Drive' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Office' }).first()).toBeVisible()
  })

  test('clic sur Drive ouvre la page Drive', async ({ page }) => {
    await page.getByRole('link', { name: 'Drive' }).first().click()
    await expect(page).toHaveURL(/\/app\/drive/)
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible()
  })

  test('clic sur Office ouvre la page Office', async ({ page }) => {
    await page.getByRole('link', { name: 'Office' }).first().click()
    await expect(page).toHaveURL(/\/app\/office/)
    await expect(page.getByRole('heading', { name: /suite office|office/i })).toBeVisible()
  })
})
