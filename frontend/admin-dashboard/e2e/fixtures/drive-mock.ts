import { Page } from '@playwright/test'

/** ID de nœud utilisé par les mocks E2E (création document, etc.) */
export const E2E_DRIVE_NODE_ID = 12345

const defaultNode = {
  id: E2E_DRIVE_NODE_ID,
  tenant_id: 1,
  user_id: 1,
  parent_id: null as number | null,
  name: 'Sans titre.html',
  is_folder: false,
  size: 0,
  mime_type: 'text/html',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

/**
 * Active les mocks API Drive pour les scénarios "création document → éditeur".
 * À appeler avant d’ouvrir la page Drive ou Office (ou au début du test).
 */
export async function mockDriveForDocumentTests(page: Page): Promise<void> {
  await page.route('**/drive/nodes', async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.method() === 'POST') {
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
            name: body.name || 'Sans titre.html',
            is_folder: false,
          }),
        })
        return
      }
    }
    if (req.method() === 'GET' && !url.includes('/content')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...defaultNode }]),
      })
      return
    }
    await route.continue()
  })

  await page.route(`**/drive/nodes/${E2E_DRIVE_NODE_ID}/content**`, async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, body: '', contentType: 'text/html' })
      return
    }
    if (req.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: E2E_DRIVE_NODE_ID, size: 0 }),
      })
      return
    }
    await route.continue()
  })
}
