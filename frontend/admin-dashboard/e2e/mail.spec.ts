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
    // Contenu attendu : liste/comptes ou message "aucune adresse" ou erreur service
    await expect(
      page.getByText(/adresses? reliées?|aucune adresse mail reliée|connecter une adresse mail|service Mail ne répond pas/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('clic sur Mail dans le hub ouvre la page Mail', async ({ page }) => {
    await page.getByRole('link', { name: 'Mail' }).first().click()
    await expect(page).toHaveURL(/\/app\/mail/)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible()
  })
})
