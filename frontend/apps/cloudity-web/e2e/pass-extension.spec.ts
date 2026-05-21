import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_EMAIL, DEMO_PASSWORD } from './fixtures/auth'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const EXTENSION_PATH = path.join(REPO_ROOT, 'extensions/cloudity-pass/dist')
const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:6001').replace(/\/$/, '')
const API_URL = (process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://localhost:6080').replace(/\/$/, '')
const MASTER_PASSWORD = process.env.PLAYWRIGHT_E2E_MASTER ?? DEMO_PASSWORD

type ExtensionResponse = { ok?: boolean; error?: string; unlocked?: boolean }

async function loginWeb(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login?next=${encodeURIComponent('/app/pass')}`)
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/mot de passe|password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.waitForURL(/\/app\/pass(\/|$)/, { timeout: 20_000 })
  await page.goto(`${BASE_URL}/app/pass`)
}

async function createPassEntry(page: Page, itemUrl: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible({ timeout: 10_000 })
  await page.getByLabel(/Mot de passe maître/).fill(MASTER_PASSWORD)
  await page.getByRole('button', { name: /Déverrouiller/ }).click()
  await expect(page.getByText(/Coffre déverrouillé/)).toBeVisible({ timeout: 30_000 })

  const vaultName = `e2e-extension-${Date.now()}`
  await page.getByPlaceholder(/Nouveau coffre/).fill(vaultName)
  await page.getByRole('button', { name: 'Créer un coffre' }).click()
  await expect(page.getByText('Coffre créé')).toBeVisible()
  await page.getByRole('button').filter({ hasText: vaultName }).click()

  await page.getByRole('button', { name: /Nouvelle entrée/ }).click()
  await page.getByLabel('Titre').fill('E2E Extension Login')
  await page.getByRole('textbox', { name: 'URL' }).fill(itemUrl)
  await page.getByRole('textbox', { name: 'Utilisateur' }).fill('extension-user@example.test')
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('extension-secret-123!')
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(page.getByText(/Entrée chiffrée \+ enregistrée/)).toBeVisible()
}

async function extensionWorkerFromContext(context: BrowserContext): Promise<Worker> {
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 })
  return worker
}

function extensionIdFromWorker(worker: Worker): string {
  const id = worker.url().split('/')[2]
  if (!id) throw new Error(`Extension ID introuvable depuis ${worker.url()}`)
  return id
}

async function sendExtensionMessage(page: Page, message: unknown): Promise<ExtensionResponse> {
  return page.evaluate((msg) => {
    return new Promise<ExtensionResponse>((resolve) => {
      const runtime = (globalThis as typeof globalThis & {
        chrome?: { runtime?: { sendMessage?: (message: unknown, callback: (response: ExtensionResponse) => void) => void } }
      }).chrome?.runtime
      if (!runtime?.sendMessage) {
        resolve({ ok: false, error: 'chrome_runtime_unavailable' })
        return
      }
      runtime.sendMessage(msg, (response: ExtensionResponse) => resolve(response ?? { ok: false, error: 'no_response' }))
    })
  }, message)
}

async function proxyGatewayForExtension(context: BrowserContext): Promise<void> {
  await context.route(`${API_URL}/**`, async (route, request) => {
    const origin = (await request.headerValue('origin')) ?? '*'
    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-allow-headers': (await request.headerValue('access-control-request-headers')) ?? 'authorization,content-type',
      vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }

    const headers = await request.allHeaders()
    delete headers.host
    const upstream = await fetch(request.url(), {
      method: request.method(),
      headers,
      body: request.postDataBuffer(),
    })
    const body = Buffer.from(await upstream.arrayBuffer())
    await route.fulfill({
      status: upstream.status,
      headers: {
        ...Object.fromEntries(upstream.headers.entries()),
        ...corsHeaders,
      },
      body,
    })
  })
}

async function installServiceWorkerApiMock(worker: Worker): Promise<void> {
  const auth = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, tenant_id: '1' }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Login API mock extension refusé (${res.status})`)
    return res.json() as Promise<{ access_token?: string; user_id?: number | string }>
  })
  const token = auth.access_token
  if (!token) throw new Error('Token web Pass introuvable pour préparer le mock extension')

  const vaults = await fetch(`${API_URL}/pass/vaults`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => res.json()) as Array<{ id: number; name: string }>
  const itemsByVaultId: Record<string, unknown[]> = {}
  for (const vault of vaults) {
    if (!vault.name.toLowerCase().startsWith('e2e-extension-')) continue
    itemsByVaultId[String(vault.id)] = await fetch(`${API_URL}/pass/vaults/${vault.id}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => res.json()) as unknown[]
  }
  const extensionVaults = vaults.filter((vault) => vault.name.toLowerCase().startsWith('e2e-extension-'))
  const userIdStr = String(auth.user_id ?? '1')

  await worker.evaluate(({ extensionVaults, itemsByVaultId, userIdStr }) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
    const scope = globalThis as typeof globalThis & { fetch: typeof fetch }
    scope.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/auth/login')) {
        return json({ access_token: 'e2e-extension-token', refresh_token: '', user_id: userIdStr })
      }
      if (url.endsWith('/pass/vaults')) {
        return json(extensionVaults)
      }
      const match = url.match(/\/pass\/vaults\/(\d+)\/items$/)
      if (match) {
        return json(itemsByVaultId[match[1]] ?? [])
      }
      return json({ error: `unexpected mock url: ${url}` }, 404)
    }
  }, { extensionVaults, itemsByVaultId, userIdStr })
}

async function cleanupExtensionVaults(): Promise<void> {
  const auth = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, tenant_id: '1' }),
  }).then((res) => res.ok ? res.json() as Promise<{ access_token?: string }> : null)
  const token = auth?.access_token
  if (!token) return
  const vaults = await fetch(`${API_URL}/pass/vaults`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => res.ok ? res.json() as Promise<Array<{ id: number; name: string }>> : [])
  for (const vault of vaults) {
    if (!vault.name.toLowerCase().startsWith('e2e-extension-')) continue
    await fetch(`${API_URL}/pass/vaults/${vault.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}

test.describe('Pass extension MP-07 (Chromium)', () => {
  test.skip(
    process.env.PLAYWRIGHT_RUN_PASS_EXTENSION !== '1',
    'MP-07 est lancé par make test-e2e-playwright-pass-extension'
  )

  test('charge l’extension et autofill une entrée Cloudity après clic utilisateur', async () => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cloudity-pass-extension-'))
    const loginUrl = 'http://cloudity-extension-e2e.test/login'
    let context: BrowserContext | undefined
    let webPage: Page | undefined

    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: process.env.PLAYWRIGHT_EXTENSION_HEADED === '1' ? false : true,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
        ],
      })

      const worker = await extensionWorkerFromContext(context)
      const extensionId = extensionIdFromWorker(worker)
      const extensionPage = await context.newPage()
      await extensionPage.goto(`chrome-extension://${extensionId}/popup/popup.html`)

      webPage = await context.newPage()
      await loginWeb(webPage)
      await createPassEntry(webPage, loginUrl)
      await proxyGatewayForExtension(context)
      await installServiceWorkerApiMock(worker)

      await expect.poll(() => sendExtensionMessage(extensionPage, { kind: 'save-gateway', gatewayUrl: API_URL })).toMatchObject({ ok: true })
      const loginResp = await sendExtensionMessage(extensionPage, {
        kind: 'login',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        tenantId: '1',
      })
      expect(loginResp, `login extension refusé: ${loginResp.error ?? 'erreur inconnue'}`).toMatchObject({ ok: true })
      await expect.poll(() => sendExtensionMessage(extensionPage, {
        kind: 'unlock',
        password: MASTER_PASSWORD,
      })).toMatchObject({ ok: true })
      await expect.poll(() => sendExtensionMessage(extensionPage, { kind: 'status' })).toMatchObject({ unlocked: true })

      const fillPage = await context.newPage()
      await fillPage.route('**/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!doctype html>
            <html lang="fr">
              <body>
                <form>
                  <label>Email <input id="email" name="email" type="email" autocomplete="username"></label>
                  <label>Mot de passe <input id="password" name="password" type="password" autocomplete="current-password"></label>
                </form>
              </body>
            </html>`,
        })
      })
      await fillPage.goto(loginUrl)

      await fillPage.locator('.cloudity-pass-badge').first().click({ timeout: 15_000 })
      await fillPage.getByRole('button', { name: /E2E Extension Login/ }).first().click()
      await expect(fillPage.locator('#email')).toHaveValue('extension-user@example.test')
      await expect(fillPage.locator('#password')).toHaveValue('extension-secret-123!')
    } finally {
      await cleanupExtensionVaults().catch(() => undefined)
      await context?.close().catch(() => undefined)
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })
})
