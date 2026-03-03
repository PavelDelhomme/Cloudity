import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'
import { mockDriveForDocumentTests, E2E_EDITOR_URL_REGEX } from './fixtures/drive-mock'

test.describe('Éditeur de document (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/drive' })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
  })

  test.skip('sauvegarde manuelle : taper du texte puis Enregistrer affiche un toast de succès', async ({ page }) => {
    // Skip: même flux création document → éditeur (mock cross-origin).
    await mockDriveForDocumentTests(page)
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Nouveau fichier' }).click()
    await expect(page.getByText('Type de fichier')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-new-document').click()
    await expect(page).toHaveURL(E2E_EDITOR_URL_REGEX, { timeout: 15000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor.click()
    await editor.pressSequentially(' Texte E2E sauvegarde', { delay: 80 })
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled({ timeout: 3000 })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Enregistré').or(page.getByText('Sauvegardé'))).toBeVisible({ timeout: 10000 })
  })
})
