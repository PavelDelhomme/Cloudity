import { test, expect } from '@playwright/test'

/**
 * E2E Drive : boutons Téléverser, Dossier, Nouveau dossier dans le navigateur réel.
 * Prérequis : app en marche (make up), utilisateur connecté sur /app/drive.
 * Port par défaut : 6001 (docker-compose admin-dashboard).
 */
test.describe('Drive (UI réelle)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/drive')
    const isLogin = await page.getByRole('heading', { name: /connexion|login/i }).isVisible().catch(() => false)
    if (isLogin) {
      test.skip(true, 'Non connecté : aller sur /app/drive après connexion manuelle puis relancer les tests')
    }
  })

  test('page Drive affiche le titre et les boutons', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible()
    await expect(page.getByText('Téléverser')).toBeVisible()
    await expect(page.getByText('Dossier')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouveau dossier' })).toBeVisible()
  })

  test('Nouveau dossier : clic ouvre le formulaire sans bloquer', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Nouveau dossier' }).first()
    await btn.click()
    await expect(page.getByPlaceholder('Nom du dossier')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByPlaceholder('Nom du dossier')).not.toBeVisible()
  })

  test('Téléverser : file chooser puis fichier apparaît dans l\'overlay', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 })
    await page.getByText('Téléverser').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles('e2e/fixtures/test-file.txt')
    await expect(page.getByText('test-file.txt')).toBeVisible({ timeout: 10000 })
  })

  test('Dossier : file chooser puis entrée dans l\'overlay', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 })
    await page.getByText('Dossier').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles('e2e/fixtures/test-file.txt')
    await expect(page.getByText('test-file.txt')).toBeVisible({ timeout: 10000 })
  })
})
