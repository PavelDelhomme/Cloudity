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
    // Page Office : titre "Documents & Fichiers"
    await expect(page.getByRole('heading', { name: /Documents\s*&\s*Fichiers/i })).toBeVisible()
  })

  test('hub affiche les liens Pass, Mail et Corbeille', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Pass' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mail' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Corbeille' }).first()).toBeVisible()
  })

  test('Corbeille : depuis le hub ouvre la vue corbeille du Drive', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: /Corbeille/i }).first().click()
    await expect(page).toHaveURL(/view=trash/)
    await expect(page.getByRole('heading', { name: 'Corbeille' })).toBeVisible({ timeout: 10000 })
  })

  test('clic sur Pass ouvre la page Pass', async ({ page }) => {
    await page.getByRole('link', { name: 'Pass' }).first().click()
    await expect(page).toHaveURL(/\/app\/pass/)
    await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible()
  })

  test('clic sur Mail ouvre la page Mail', async ({ page }) => {
    await page.getByRole('link', { name: 'Mail' }).first().click()
    await expect(page).toHaveURL(/\/app\/mail/)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible()
  })
})
