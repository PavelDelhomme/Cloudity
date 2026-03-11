import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Pass (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/pass' })
    await page.goto('/app/pass')
    await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible({ timeout: 10000 })
  })

  test('page Pass affiche le titre et le bouton Nouveau coffre', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Nouveau coffre|Création…/ })).toBeVisible()
    await expect(page.getByPlaceholder('Nom du coffre')).toBeVisible()
  })

  test('fil d’Ariane contient Tableau de bord et Pass', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Tableau de bord' }).first()).toBeVisible()
    await expect(page.getByText('Pass', { exact: true }).first()).toBeVisible()
  })

  test('page Pass contient un lien vers le tableau de bord', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Tableau de bord' }).first()).toBeVisible()
  })
})
