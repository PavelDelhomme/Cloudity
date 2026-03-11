import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'
import { mockDriveForDocumentTests, E2E_EDITOR_URL_REGEX, E2E_DRIVE_NODE_ID } from './fixtures/drive-mock'

test.describe('Drive (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/drive' })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
  })

  test('page Drive affiche le titre et les boutons', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Téléverser' })).toBeVisible()
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

  test.skip('Nouveau fichier → Document crée un fichier et ouvre l’éditeur', async ({ page }) => {
    // Skip: le mock API ne déclenche pas la navigation vers l’éditeur (requêtes cross-origin 6080).
    await mockDriveForDocumentTests(page)
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Nouveau fichier' }).click()
    await expect(page.getByText('Type de fichier')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-new-document').click()
    await expect(page).toHaveURL(E2E_EDITOR_URL_REGEX, { timeout: 15000 })
    await expect(page.getByRole('button', { name: /enregistrer|save/i })).toBeVisible({ timeout: 5000 })
  })

  test('Nouveau dossier : clic ouvre le formulaire sans bloquer', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
    await expect(page.getByPlaceholder('Nom du dossier')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByPlaceholder('Nom du dossier')).not.toBeVisible()
  })

  test('Drive affiche le tableau avec en-têtes (Nom, Taille, etc.)', async ({ page }) => {
    // Vue grille par défaut : soit tableau (vue liste), soit grille (Tout sélectionner), soit message vide
    await expect(
      page.getByRole('table').or(page.getByText('Tout sélectionner')).or(page.getByText(/aucun fichier|vide|créer/i))
    ).toBeVisible({ timeout: 5000 })
  })

  test('Téléverser ouvre un menu Fichiers / Dossiers', async ({ page }) => {
    await page.getByRole('button', { name: 'Téléverser' }).click()
    await expect(page.getByText('Un ou plusieurs fichiers')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Un ou plusieurs dossiers')).toBeVisible()
  })

  test('Téléverser : file chooser puis fichier apparaît dans l’overlay', async ({ page }) => {
    await page.getByRole('button', { name: 'Téléverser' }).click()
    await page.getByText('Un ou plusieurs fichiers').click()
    const input = page.locator('#drive-file-upload')
    await input.waitFor({ state: 'attached', timeout: 10000 })
    await input.setInputFiles('e2e/fixtures/test-file.txt')
    await expect(page.getByText('test-file.txt').first()).toBeVisible({ timeout: 15000 })
  })

  test('fil d’Ariane Drive visible sur la page', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Drive' }).or(page.getByText('Racine')).first()).toBeVisible({ timeout: 5000 })
  })

  test('zone principale contient un tableau ou un message vide', async ({ page }) => {
    await expect(
      page.getByRole('table').or(page.getByText(/aucun fichier|vide|créer|Tout sélectionner/i))
    ).toBeVisible({ timeout: 8000 })
  })

  test('Drive : tableau a des colonnes Nom et dates si présent', async ({ page }) => {
    const table = page.getByRole('table').first()
    const gridOrEmpty = page.getByText(/Tout sélectionner|aucun|vide/i).first()
    await expect(table.or(gridOrEmpty)).toBeVisible({ timeout: 8000 })
    const hasTable = await table.isVisible().catch(() => false)
    if (hasTable) {
      await expect(page.getByText(/nom|name/i).first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('Drive : Nouveau dossier avec nom puis Annuler ferme sans créer', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
    await expect(page.getByPlaceholder('Nom du dossier')).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder('Nom du dossier').fill('E2E Dossier Test')
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByPlaceholder('Nom du dossier')).not.toBeVisible({ timeout: 3000 })
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
    // Fil d'Ariane : "Racine" (span ou button selon le cas)
    await expect(page.getByText('Racine').first()).toBeVisible({ timeout: 5000 })
    await page.getByText('Racine').first().click()
    await expect(page.getByText('E2E Dossier Breadcrumb').first()).toBeVisible({ timeout: 10000 })
  })

  test('sélection 1 élément : Déplacer vers la corbeille ouvre la modale et confirmer envoie DELETE', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('cloudity_drive_display', 'list') })
    const deletedIds: number[] = []
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content')) {
        await route.continue()
        return
      }
      if (req.method() === 'DELETE') {
        const match = url.match(/\/drive\/nodes\/(\d+)/)
        if (match) deletedIds.push(parseInt(match[1]!, 10))
        await route.fulfill({ status: 200 })
        return
      }
      if (req.method() === 'GET') {
        const isTrash = url.includes('trash')
        if (isTrash) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
          return
        }
        const nodes = [
          { id: 101, tenant_id: 1, user_id: 1, parent_id: null, name: 'Fichier E2E 1', is_folder: false, size: 100, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nodes) })
        return
      }
      await route.continue()
    })
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Fichier E2E 1').first()).toBeVisible({ timeout: 10000 })
    const firstRow = page.getByRole('table').locator('tbody tr').first()
    await firstRow.getByRole('button', { name: 'Sélectionner' }).click()
    await expect(page.getByTestId('drive-bulk-delete-btn')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText(/1 élément\(s\) sélectionné\(s\)/)).toBeVisible()
    await page.getByTestId('drive-bulk-delete-btn').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Déplacer dans la corbeille' })).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-confirm-delete-to-trash').click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
    expect(deletedIds).toContain(101)
  })

  test('sélection plusieurs éléments : Tout sélectionner puis Déplacer vers la corbeille', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('cloudity_drive_display', 'list') })
    const deletedIds: number[] = []
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content')) {
        await route.continue()
        return
      }
      if (req.method() === 'DELETE') {
        const match = url.match(/\/drive\/nodes\/(\d+)/)
        if (match) deletedIds.push(parseInt(match[1]!, 10))
        await route.fulfill({ status: 200 })
        return
      }
      if (req.method() === 'GET') {
        const isTrash = url.includes('trash')
        if (isTrash) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
          return
        }
        const nodes = [
          { id: 201, tenant_id: 1, user_id: 1, parent_id: null, name: 'Dossier A', is_folder: true, size: 0, child_folders: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: 202, tenant_id: 1, user_id: 1, parent_id: null, name: 'Fichier B', is_folder: false, size: 50, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nodes) })
        return
      }
      await route.continue()
    })
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Dossier A').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Fichier B').first()).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Tout sélectionner' }).click()
    await expect(page.getByText(/2 élément\(s\) sélectionné\(s\)/)).toBeVisible({ timeout: 2000 })
    await page.getByTestId('drive-bulk-delete-btn').click()
    await expect(page.getByRole('dialog').filter({ hasText: '2 élément(s)' })).toBeVisible({ timeout: 3000 })
    await page.getByTestId('drive-confirm-delete-to-trash').click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
    expect(deletedIds).toContain(201)
    expect(deletedIds).toContain(202)
  })

  test('vue grille par défaut : affichage en cartes ou tableau selon préférence', async ({ page }) => {
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content') || url.includes('trash')) {
        await route.continue()
        return
      }
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, tenant_id: 1, user_id: 1, parent_id: null, name: 'Dossier E2E', is_folder: true, size: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { id: 2, tenant_id: 1, user_id: 1, parent_id: null, name: 'Fichier.txt', is_folder: false, size: 100, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ]),
        })
        return
      }
      await route.continue()
    })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Dossier E2E').or(page.getByText('Fichier.txt')).first()).toBeVisible({ timeout: 8000 })
    const hasGrid = await page.getByText('Tout sélectionner').isVisible().catch(() => false)
    const hasTable = await page.getByRole('table').isVisible().catch(() => false)
    expect(hasGrid || hasTable).toBeTruthy()
  })

  test('bascule vue liste : clic sur icône liste affiche le tableau', async ({ page }) => {
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('/content') || url.includes('trash')) {
        await route.continue()
        return
      }
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, tenant_id: 1, user_id: 1, parent_id: null, name: 'Fichier E2E', is_folder: false, size: 50, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ]),
        })
        return
      }
      await route.continue()
    })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Fichier E2E').first()).toBeVisible({ timeout: 8000 })
    const listButton = page.getByRole('button', { name: /liste|list/i }).first()
    if (await listButton.isVisible().catch(() => false)) {
      await listButton.click()
      await expect(page.getByRole('table')).toBeVisible({ timeout: 3000 })
    }
  })

  test('clic sur un fichier ouvre la modale d\'aperçu', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cloudity_drive_display', 'grid')
    })
    // Route dédiée pour le contenu du fichier (prioritaire)
    await page.route('**/drive/nodes/301/content', async (route) => {
      await route.fulfill({
        status: 200,
        body: 'Contenu aperçu E2E',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    })
    await page.route('**/drive/nodes**', async (route) => {
      const req = route.request()
      const url = req.url()
      if (url.includes('trash')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        return
      }
      if (url.includes('/content')) {
        await route.continue()
        return
      }
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 301, tenant_id: 1, user_id: 1, parent_id: null, name: 'Aperçu.txt', is_folder: false, size: 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ]),
        })
        return
      }
      await route.continue()
    })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Aperçu.txt').first()).toBeVisible({ timeout: 8000 })
    // Double-clic sur la carte (role=button) qui contient le nom du fichier
    const card = page.getByRole('button').filter({ hasText: 'Aperçu.txt' }).first()
    await card.dblclick()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('dialog').filter({ hasText: 'Aperçu.txt' })).toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: 'Fermer' }).first()).toBeVisible({ timeout: 2000 })
  })

  test('Corbeille : lien hub ouvre la vue corbeille du Drive', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: /Corbeille/ }).first().click()
    await expect(page).toHaveURL(/view=trash/)
    await expect(page.getByRole('heading', { name: 'Corbeille' })).toBeVisible({ timeout: 5000 })
  })

  test.skip('suppression : créer un document, retour Drive, supprimer le fichier', async ({ page }) => {
    // Skip: dépend du flux création document → éditeur (mock non fiable).
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
            body: JSON.stringify({ id: E2E_DRIVE_NODE_ID, name: 'Sans titre.docx', is_folder: false }),
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
          id: E2E_DRIVE_NODE_ID, tenant_id: 1, user_id: 1, parent_id: null, name: 'Sans titre.docx', is_folder: false,
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
    await expect(page).toHaveURL(E2E_EDITOR_URL_REGEX, { timeout: 15000 })
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
