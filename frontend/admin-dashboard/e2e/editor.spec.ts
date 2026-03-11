import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'
import { mockDriveForDocumentTests, mockEditorPage, E2E_EDITOR_URL_REGEX } from './fixtures/drive-mock'

test.describe('Éditeur de document (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/drive' })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
  })

  test('ouverture éditeur par URL : modale Lien (popup custom)', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Insertion/ }).click()
    const insertionMenu = page.getByTestId('menu-insertion')
    await expect(insertionMenu).toBeVisible({ timeout: 2000 })
    await insertionMenu.getByRole('button', { name: 'Lien' }).click()
    const linkDialog = page.getByRole('dialog').filter({ hasText: 'Insérer un lien' })
    await expect(linkDialog).toBeVisible({ timeout: 5000 })
    await linkDialog.getByRole('textbox', { name: /URL/ }).fill('https://example.com')
    await linkDialog.getByRole('button', { name: 'Insérer' }).click()
    await expect(linkDialog).not.toBeVisible({ timeout: 3000 })
  })

  test('ouverture éditeur par URL : modale Tableau (popup custom)', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Insertion/ }).click()
    await page.getByRole('button', { name: 'Tableau', exact: true }).click()
    await expect(page.getByRole('dialog', { name: /Insérer un tableau/ })).toBeVisible({ timeout: 3000 })
    await page.getByLabel(/Nombre de lignes/).fill('4')
    await page.getByLabel(/Nombre de colonnes/).fill('5')
    await page.getByRole('dialog', { name: /Insérer un tableau/ }).getByRole('button', { name: 'Insérer' }).click()
    await expect(page.getByRole('dialog', { name: /Insérer un tableau/ })).not.toBeVisible({ timeout: 3000 })
  })

  test('modale Quitter : modifications non enregistrées → Annuler reste dans l’éditeur', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially(' modification', { delay: 50 })
    await page.getByRole('button', { name: /Fermer/ }).click()
    await expect(page.getByRole('dialog', { name: /Modifications non enregistrées/ })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('dialog', { name: /Modifications non enregistrées/ })).not.toBeVisible({ timeout: 2000 })
    await expect(page.getByTestId('editor-save-state')).toBeVisible()
  })

  test('modale Quitter : Quitter redirige hors de l’éditeur', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially(' x', { delay: 50 })
    await page.getByRole('button', { name: /Fermer/ }).click()
    await expect(page.getByRole('dialog', { name: /Modifications non enregistrées/ })).toBeVisible({ timeout: 3000 })
    await page.getByRole('dialog', { name: /Modifications non enregistrées/ }).getByRole('button', { name: 'Quitter' }).click()
    await expect(page).not.toHaveURL(/\/app\/office\/editor\//)
  })

  test('éditeur affiche la barre de menus (Fichier, Édition, Insertion)', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Fichier/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Édition/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Insertion/ })).toBeVisible()
  })

  test('éditeur affiche la zone de saisie (contenteditable)', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    const editor = page.locator('[contenteditable="true"]').first()
    await expect(editor).toBeVisible({ timeout: 10000 })
    await editor.click()
    await editor.pressSequentially('Hello E2E', { delay: 30 })
    await expect(editor).toContainText('Hello E2E')
  })

  test('menu Fichier ouvre un dropdown avec Enregistrer et Fermer', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Fichier/ }).click()
    await expect(page.getByText('Enregistrer').first()).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Fermer').first()).toBeVisible({ timeout: 2000 })
  })

  test('éditeur affiche Enregistré au chargement puis Non enregistré après saisie', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('editor-save-state')).toHaveText('Enregistré')
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially('x', { delay: 30 })
    await expect(page.getByTestId('editor-save-state')).toHaveText('Non enregistré')
  })

  test('éditeur : bouton Gras dans la barre d’outils présent et cliquable', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const boldBtn = page.getByRole('button', { name: /Gras|bold/i })
    await expect(boldBtn.first()).toBeVisible()
    await boldBtn.first().click()
    await expect(page.locator('[contenteditable="true"]').first()).toBeFocused()
  })

  test('éditeur : Format > Titre 1 applique un bloc titre', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially('Mon titre', { delay: 20 })
    await page.getByRole('button', { name: /Format/ }).click()
    await page.locator('div').filter({ hasText: 'Titre 2' }).locator('button.w-full').filter({ hasText: 'Titre 1' }).click()
    await expect(editor.locator('h1')).toBeVisible()
    await expect(editor.locator('h1')).toContainText('Mon titre')
  })

  test('éditeur : menu Édition contient Annuler et Copier', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Édition/ }).click()
    await expect(page.getByText('Annuler').first()).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Copier').first()).toBeVisible({ timeout: 2000 })
  })

  test('éditeur : menu Affichage contient Mode éditeur ou Markdown', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Affichage/ }).click()
    await expect(page.getByText(/Markdown|éditeur riche/).first()).toBeVisible({ timeout: 2000 })
  })

  test('éditeur : menu Insertion contient Lien et Tableau', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Insertion/ }).click()
    await expect(page.getByText('Lien').first()).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Tableau').first()).toBeVisible({ timeout: 2000 })
  })

  test('éditeur : menu Format contient Titre 1 et Paragraphe', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Format/ }).click()
    await expect(page.getByText('Titre 1').first()).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Paragraphe').first()).toBeVisible({ timeout: 2000 })
  })

  test('éditeur : bouton Renommer à côté du titre présent', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Renommer/ })).toBeVisible()
  })

  test('éditeur : lien Drive dans le fil d’Ariane présent', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'Drive' }).first()).toBeVisible()
  })

  test('saisie puis bouton Enregistrer de la barre devient actif', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially('texte', { delay: 20 })
    await expect(page.getByTestId('editor-save-state')).toHaveText('Non enregistré')
    const saveBtn = page.locator('button').filter({ hasText: /^Enregistrer$/ }).first()
    await expect(saveBtn).toBeEnabled()
  })

  test('éditeur : Insertion > Ligne horizontale ajoute un hr', async ({ page }) => {
    await mockEditorPage(page, 1)
    await page.goto('/app/office/editor/1')
    await expect(page.getByTestId('editor-save-state')).toBeVisible({ timeout: 10000 })
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await page.getByRole('button', { name: /Insertion/ }).click()
    await page.locator('div').filter({ hasText: 'Tableau' }).locator('button.w-full').filter({ hasText: 'Ligne horizontale' }).click()
    await expect(editor.locator('hr')).toBeVisible()
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
