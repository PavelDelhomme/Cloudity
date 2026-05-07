import { Page } from '@playwright/test'

/** ID de nœud utilisé par les mocks E2E (création document, etc.) */
export const E2E_DRIVE_NODE_ID = 12345

const defaultNode = {
  id: E2E_DRIVE_NODE_ID,
  tenant_id: 1,
  user_id: 1,
  parent_id: null as number | null,
  name: 'Sans titre.docx',
  is_folder: false,
  size: 0,
  mime_type: 'text/html',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

/**
 * Active les mocks API Drive pour les scénarios "création document → éditeur".
 * À appeler avant d’ouvrir la page Drive ou Office (ou au début du test).
 *
 * Note: Les tests qui créent un document puis attendent la navigation vers l’éditeur
 * sont actuellement en .skip car le mock (requêtes cross-origin vers 6080) ne déclenche
 * pas la navigation dans l’app. Pour les réactiver: retirer le .skip dans drive.spec.ts,
 * editor.spec.ts et office.spec.ts une fois le flux débogué ou en utilisant l’API réelle.
 */
/** Regex pour vérifier qu'on est sur la page éditeur (n'importe quel ID). */
export const E2E_EDITOR_URL_REGEX = /\/app\/office\/editor\/\d+/

export async function mockDriveForDocumentTests(page: Page): Promise<void> {
  const contentRegex = new RegExp(`/drive/nodes/${E2E_DRIVE_NODE_ID}/content`)

  await page.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const method = req.method()

    if (contentRegex.test(url)) {
      if (method === 'GET') {
        await route.fulfill({ status: 200, body: '', contentType: 'text/html' })
        return
      }
      if (method === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: E2E_DRIVE_NODE_ID, size: 0 }),
        })
        return
      }
      await route.continue()
      return
    }

    if (url.includes('/drive/nodes') && !/\/drive\/nodes\/\d+/.test(url)) {
      if (method === 'POST') {
        let body: { is_folder?: boolean; name?: string } = {}
        try {
          body = await req.postDataJSON()
        } catch { /* ignore */ }
        if (body && body.is_folder === false) {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: E2E_DRIVE_NODE_ID,
              name: body.name || 'Sans titre.docx',
              is_folder: false,
            }),
          })
          return
        }
      }
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ ...defaultNode }]),
        })
        return
      }
    }

    await route.continue()
  })
}

/** Mock minimal pour ouvrir l’éditeur par navigation directe (ex. /app/office/editor/1). */
export async function mockEditorPage(page: Page, nodeId = 1): Promise<void> {
  const node = {
    id: nodeId,
    tenant_id: 1,
    user_id: 1,
    parent_id: null as number | null,
    name: 'Doc E2E.html',
    is_folder: false,
    size: 0,
    mime_type: 'text/html',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  // Une seule route : ne jamais `continue()` sur GET …/content (sinon le vrai backend renvoie du
  // binaire et l’éditeur affiche du bruit). Les anciennes doubles routes + ordre Playwright
  // faisaient matcher `**/drive/nodes**` avant la route dédiée au content.
  const contentPath = `/drive/nodes/${nodeId}/content`
  await page.unroute('**/drive/nodes**').catch(() => {})
  await page.route('**/drive/nodes**', async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.method() === 'GET' && url.includes(contentPath)) {
      await route.fulfill({ status: 200, body: '<p>Contenu E2E</p>', contentType: 'text/html' })
      return
    }
    if (req.method() === 'GET' && !url.includes('/content')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([node]),
      })
      return
    }
    await route.continue()
  })
}
