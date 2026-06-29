import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

type MockAlias = {
  id: number
  account_id: number
  alias_email: string
  label?: string
  enabled?: boolean
  created_at: string
}

async function mockMailRulesStack(page: import('@playwright/test').Page, aliases: MockAlias[] = []) {
  await page.route('**/mail/me/accounts', async (route, request) => {
    if (request.method() !== 'GET') return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, user_id: 1, tenant_id: 1, email: 'admin@cloudity.local', label: 'Démo', imap_host: 'h', imap_port: 993, smtp_host: 's', smtp_port: 587 },
      ]),
    })
  })
  await page.route('**/mail/me/accounts/1/messages?*', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
  )
  await page.route('**/mail/me/accounts/1/aliases', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aliases) })
  )
  await page.route('**/mail/me/accounts/1/imap-folders', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/mail/me/accounts/1/folder-summary', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        inbox: { total: 0, unread: 0 },
        sent: { total: 0, unread: 0 },
        drafts: { total: 0, unread: 0 },
        archive: { total: 0, unread: 0 },
        spam: { total: 0, unread: 0 },
        trash: { total: 0, unread: 0 },
        extra: [],
      }),
    })
  )
  await page.route('**/mail/me/accounts/1/tags', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/mail/me/accounts/1/rules', async (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.continue()
  })
  await page.route('**/contacts', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/pass/vaults', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
}

test.describe('Mail (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('affiche la page Mail et charge les comptes (pas de 404)', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page).toHaveURL(/\/app\/mail/)
    // Titre Mail visible = page chargée (pas 404)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    // Contenu attendu : section Boîtes mail, bouton ajouter, ou chargement / erreur
    await expect(
      page.getByText(/Boîtes mail|Menu Mail|Chargement des comptes|service Mail ne répond pas/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('clic sur Mail dans le hub ouvre la page Mail', async ({ page }) => {
    await page.getByRole('link', { name: 'Mail' }).first().click()
    await expect(page).toHaveURL(/\/app\/mail/)
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible()
  })

  test('page Mail affiche une section ou un bouton pour les boîtes', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/boîtes|ajouter|mail/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('page Mail : fil d’Ariane ou lien tableau de bord présent', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: /tableau de bord|Tableau de bord/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('page Mail : pas d’erreur réseau visible au chargement', async ({ page }) => {
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/erreur 500|failed to fetch|network error/i)).not.toBeVisible({ timeout: 3000 })
  })

  /** Non-régression AppPageChrome / MailPage — voir docs/operations/TESTS.md § 4.8 */
  test('navigation Mail ↔ Drive — pas de Maximum update depth (console / pageerror)', async ({ page }) => {
    const depthLoop: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (t.includes('Maximum update depth')) depthLoop.push(`console[${msg.type()}]: ${t}`)
    })
    page.on('pageerror', (err) => {
      if (err.message.includes('Maximum update depth')) depthLoop.push(`pageerror: ${err.message}`)
    })

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(600)

    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Drive' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(400)

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(600)

    expect(depthLoop).toEqual([])
  })

  test('boîte en erreur sync : bannière visible (last_sync_error)', async ({ page }) => {
    await page.route('**/mail/me/accounts', async (route, request) => {
      if (request.method() !== 'GET') return route.continue()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            user_id: 1,
            tenant_id: 1,
            email: 'test@example.com',
            label: 'Test',
            imap_auth_ready: false,
            last_sync_error: 'mot de passe IMAP refusé',
            imap_host: 'imap.example.com',
            imap_port: 993,
            smtp_host: 'smtp.example.com',
            smtp_port: 587,
          },
        ]),
      })
    })
    await page.route('**/mail/me/accounts/1/messages?*', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
    )
    await page.route('**/mail/me/accounts/1/imap-folders', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route('**/mail/me/accounts/1/folder-summary', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          inbox: { total: 0, unread: 0 },
          sent: { total: 0, unread: 0 },
          drafts: { total: 0, unread: 0 },
          archive: { total: 0, unread: 0 },
          spam: { total: 0, unread: 0 },
          trash: { total: 0, unread: 0 },
          extra: [],
        }),
      })
    )
    await page.route('**/mail/me/accounts/1/tags', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route('**/mail/me/accounts/1/rules', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route('**/mail/me/accounts/1/aliases', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/mot de passe IMAP|synchronisation|sync/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('règles Mail : création combinée (from + subject + PJ) envoie le bon payload', async ({ page }) => {
    await mockMailRulesStack(page)
    let captured: any = null
    await page.route('**/mail/me/accounts/1/rules', async (route, request) => {
      if (request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
      if (request.method() !== 'POST') return route.continue()
      captured = request.postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 99 }) })
    })

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /Paramètres Mail/i }).first().click()
    await expect(page.getByRole('heading', { name: /Paramètres Mail/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Règles automatiques \(tri\)/i })).toBeVisible()

    await page.getByPlaceholder('Nom règle (optionnel)').fill('Règle combinée E2E')
    await page.getByRole('textbox', { name: 'Expéditeur contient' }).fill('newsletter@')
    await page.getByRole('textbox', { name: 'Sujet contient' }).fill('facture')
    await page.getByLabel('Uniquement avec PJ').check()
    await page.getByRole('button', { name: /Ajouter la règle/i }).click()

    await expect.poll(() => captured).not.toBeNull()
    expect(captured).toMatchObject({
      name: 'Règle combinée E2E',
      from_pattern: 'newsletter@',
      subject_pattern: 'facture',
      has_attachments: true,
      action_folder: 'inbox',
      enabled: true,
    })
  })

  test('règles Mail : rétro-application appelle /rules/apply', async ({ page }) => {
    await mockMailRulesStack(page)
    let applyCalls = 0
    await page.route('**/mail/me/accounts/1/rules/apply', async (route, request) => {
      if (request.method() !== 'POST') return route.continue()
      applyCalls += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, affected: 3 }) })
    })

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /Paramètres Mail/i }).first().click()
    await expect(page.getByRole('button', { name: /Appliquer aux mails existants/i })).toBeVisible()
    await page.getByRole('button', { name: /Appliquer aux mails existants/i }).click()

    await expect.poll(() => applyCalls).toBe(1)
  })

  test('alias Mail : composer depuis un alias actif envoie le bon from_email', async ({ page }) => {
    await mockMailRulesStack(page, [
      {
        id: 10,
        account_id: 1,
        alias_email: 'alias@exemple.fr',
        label: 'Travail',
        enabled: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 11,
        account_id: 1,
        alias_email: 'desactive@exemple.fr',
        label: 'Désactivé',
        enabled: false,
        created_at: new Date().toISOString(),
      },
    ])
    let captured: any = null
    await page.route('**/mail/me/send', async (route, request) => {
      if (request.method() !== 'POST') return route.continue()
      captured = request.postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OK' }) })
    })

    await page.goto('/app/mail')
    await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Nouveau/i }).click()

    const fromSelect = page.getByLabel('De', { exact: true })
    await expect(fromSelect).toContainText('alias@exemple.fr')
    await expect(page.getByRole('option', { name: 'desactive@exemple.fr' })).toHaveCount(0)
    await fromSelect.selectOption('alias@exemple.fr')
    await page.getByLabel('Destinataire').fill('dest@example.net')
    await page.getByLabel('Objet').fill('Alias C6 E2E')
    await page.getByRole('button', { name: 'Envoyer' }).click()

    await expect.poll(() => captured).toMatchObject({
      account_id: 1,
      to: 'dest@example.net',
      subject: 'Alias C6 E2E',
      from_email: 'alias@exemple.fr',
    })
  })
})
