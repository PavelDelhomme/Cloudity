import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Calendrier (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('affiche la page Calendrier, le mini-calendrier et le menu Créer', async ({ page }) => {
    await page.goto('/app/calendar')
    await expect(page).toHaveURL(/\/app\/calendar/)
    await expect(page.getByRole('heading', { name: /Calendrier/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Mois précédent' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mois suivant' })).toBeVisible()
    await page.getByRole('button', { name: /ouvrir le menu/i }).click()
    await expect(page.getByRole('menuitem', { name: 'Événement' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Tâche' })).toBeVisible()
  })

  test('lien Calendar dans la barre latérale ouvre le calendrier', async ({ page }) => {
    await page.getByRole('link', { name: 'Calendar' }).first().click()
    await expect(page).toHaveURL(/\/app\/calendar/)
    await expect(page.getByRole('heading', { name: /Calendrier/ })).toBeVisible({ timeout: 15000 })
  })

  test('menu Créer : Tâche mène vers la page Tâches', async ({ page }) => {
    await page.goto('/app/calendar')
    await expect(page.getByRole('heading', { name: /Calendrier/ })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /ouvrir le menu/i }).click()
    await page.getByRole('menuitem', { name: 'Tâche' }).click()
    await expect(page).toHaveURL(/\/app\/tasks/)
    await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible({ timeout: 10000 })
  })
})
