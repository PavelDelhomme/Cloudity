import { test, expect } from '@playwright/test'

test.describe('Connexion (E2E)', () => {
  test('page login affiche le formulaire', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/mot de passe|password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible()
  })

  test('connexion avec identifiants invalides affiche une erreur', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('invalid@test.com')
    await page.getByLabel(/mot de passe|password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page.getByText(/erreur|invalid|incorrect/i)).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('connexion avec compte démo redirige vers /app', async ({ page }) => {
    const email = process.env.PLAYWRIGHT_E2E_EMAIL || 'admin@cloudity.local'
    const password = process.env.PLAYWRIGHT_E2E_PASSWORD || 'Admin123!'
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/mot de passe|password/i).fill(password)
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL(/\/(app|app\/)/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /tableau de bord|hub|cloudity/i })).toBeVisible({ timeout: 5000 })
  })

  test('page login propose un lien vers inscription si présent', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: /créer un compte/i })).toBeVisible()
  })
})
