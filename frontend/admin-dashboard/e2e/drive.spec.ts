import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'
import { mockDriveForDocumentTests, E2E_DRIVE_NODE_ID } from './fixtures/drive-mock'

test.describe('Drive (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/drive' })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
  })

  test('page Drive affiche le titre et les boutons', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible()
    await expect(page.getByText('Téléverser').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouveau dossier' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouveau fichier' })).toBeVisible()
  })

  test('Nouveau fichier ouvre le menu Document / Tableur / Présentation', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouveau fichier' }).click()
    await expect(page.getByText('Type de fichier')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: 'Document' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Tableur/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Présentation' })).toBeVisible()
  })

  test('Nouveau fichier → Document crée un fichier et ouvre l’éditeur', async ({ page }) => {
    await mockDriveForDocumentTests(page)
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Nouveau fichier' }).click()
    await expect(page.getByText('Type de fichier')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-new-document').click()
    await expect(page).toHaveURL(new RegExp(`/app/office/editor/${E2E_DRIVE_NODE_ID}`), { timeout: 15000 })
    await expect(page.getByRole('button', { name: /enregistrer|save/i })).toBeVisible({ timeout: 5000 })
  })

  test('Nouveau dossier : clic ouvre le formulaire sans bloquer', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
    await expect(page.getByPlaceholder('Nom du dossier')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByPlaceholder('Nom du dossier')).not.toBeVisible()
  })

  test('Téléverser : file chooser puis fichier apparaît dans l’overlay', async ({ page }) => {
    const input = page.locator('#drive-file-upload')
    await input.waitFor({ state: 'attached', timeout: 10000 })
    await input.setInputFiles('e2e/fixtures/test-file.txt')
    await expect(page.getByText('test-file.txt').first()).toBeVisible({ timeout: 15000 })
  })

  test('breadcrumb : entrer dans un dossier puis clic Drive ramène à la racine', async ({ page }) => {
    let getNodesCallCount = 0
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content')) {
        await route.continue()
        return
      }
      if (req.method() === 'POST') {
        let body: { is_folder?: boolean; name?: string } = {}
        try {
          body = await req.postDataJSON()
        } catch { /* ignore */ }
        if (body && body.is_folder === true) {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 100, name: body.name || 'E2E Dossier Breadcrumb', is_folder: true }),
          })
          return
        }
      }
      if (req.method() === 'GET') {
        getNodesCallCount++
        const isRoot = !url.includes('parent_id=') || url.includes('parent_id=null')
        if (isRoot && getNodesCallCount >= 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
              id: 100, tenant_id: 1, user_id: 1, parent_id: null, name: 'E2E Dossier Breadcrumb', is_folder: true,
              size: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }]),
          })
          return
        }
        if (url.includes('parent_id=100')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
          return
        }
      }
      await route.continue()
    })
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
    await expect(page.getByPlaceholder('Nom du dossier')).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder('Nom du dossier').fill('E2E Dossier Breadcrumb')
    await page.getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByPlaceholder('Nom du dossier')).not.toBeVisible({ timeout: 8000 })
    const folderRow = page.getByText('E2E Dossier Breadcrumb').first()
    await expect(folderRow).toBeVisible({ timeout: 15000 })
    await folderRow.click()
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    const driveCrumb = page.getByRole('button', { name: 'Drive' }).first()
    await expect(driveCrumb).toBeVisible()
    await driveCrumb.click()
    await expect(page.getByText('E2E Dossier Breadcrumb').first()).toBeVisible({ timeout: 10000 })
  })

  test('suppression : créer un document, retour Drive, supprimer le fichier', async ({ page }) => {
    let listReturnEmpty = false
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content')) {
        await route.continue()
        return
      }
      if (req.method() === 'POST') {
        let body: { is_folder?: boolean; name?: string } = {}
        try {
          body = await req.postDataJSON()
        } catch { /* ignore */ }
        if (body && body.is_folder === false) {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: E2E_DRIVE_NODE_ID, name: 'Sans titre.html', is_folder: false }),
          })
          return
        }
      }
      if (req.method() === 'DELETE' && url.includes(`/drive/nodes/${E2E_DRIVE_NODE_ID}`)) {
        listReturnEmpty = true
        await route.fulfill({ status: 200 })
        return
      }
      if (req.method() === 'GET') {
        if (listReturnEmpty) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
          return
        }
        const node = {
          id: E2E_DRIVE_NODE_ID, tenant_id: 1, user_id: 1, parent_id: null, name: 'Sans titre.html', is_folder: false,
          size: 0, mime_type: 'text/html', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([node]) })
        return
      }
      await route.continue()
    })
    await page.route(`**/drive/nodes/${E2E_DRIVE_NODE_ID}/content**`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, body: '', contentType: 'text/html' })
        return
      }
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: E2E_DRIVE_NODE_ID, size: 0 }) })
        return
      }
      await route.continue()
    })
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Nouveau fichier' }).click()
    await expect(page.getByText('Type de fichier')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-new-document').click()
    await expect(page).toHaveURL(new RegExp(`/app/office/editor/${E2E_DRIVE_NODE_ID}`), { timeout: 15000 })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    const fileLink = page.getByRole('link', { name: /Sans titre.*\.html/ }).first()
    await expect(fileLink).toBeVisible({ timeout: 10000 })
    await page.on('dialog', (d) => d.accept())
    const row = page.getByRole('listitem').filter({ has: fileLink })
    await row.getByRole('button', { name: 'Supprimer' }).click()
    await expect(fileLink).not.toBeVisible({ timeout: 5000 })
  })
})
