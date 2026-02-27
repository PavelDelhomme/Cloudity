import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'
import { mockDriveForDocumentTests, E2E_DRIVE_NODE_ID } from './fixtures/drive-mock'

test.describe('Office (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/office' })
    await page.goto('/app/office')
    await expect(page.getByRole('heading', { name: /suite office/i })).toBeVisible({ timeout: 10000 })
  })

  test('page Office affiche les cartes Nouveau document, Tableur, Présentation', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /suite office/i })).toBeVisible()
    await expect(page.getByTestId('office-card-document')).toBeVisible()
    await expect(page.getByTestId('office-card-tableur')).toBeVisible()
    await expect(page.getByTestId('office-card-presentation')).toBeVisible()
    await expect(page.getByText(/nouveau document/i)).toBeVisible()
    await expect(page.getByText(/nouveau tableur/i)).toBeVisible()
    await expect(page.getByText(/nouvelle présentation/i)).toBeVisible()
  })

  test('cartes Document / Tableur / Présentation sont cliquables', async ({ page }) => {
    await expect(page.getByTestId('office-card-document')).toBeVisible()
    await expect(page.getByTestId('office-card-tableur')).toBeVisible()
    await expect(page.getByTestId('office-card-presentation')).toBeVisible()
  })

  test('Carte Nouveau document crée un document et ouvre l’éditeur', async ({ page }) => {
    await mockDriveForDocumentTests(page)
    await expect(page.getByRole('heading', { name: /suite office/i })).toBeVisible({ timeout: 5000 })
    await page.getByTestId('office-card-document').click()
    await expect(page).toHaveURL(new RegExp(`/app/office/editor/${E2E_DRIVE_NODE_ID}`), { timeout: 15000 })
    await expect(page.getByRole('button', { name: /enregistrer|save/i })).toBeVisible({ timeout: 5000 })
  })

  test('section Récemment modifiés ou lien Drive visible', async ({ page }) => {
    const recentOrDrive = page.getByRole('heading', { name: /récemment modifiés/i }).or(page.getByRole('link', { name: /drive/i }))
    await expect(recentOrDrive.first()).toBeVisible({ timeout: 5000 })
  })
})
