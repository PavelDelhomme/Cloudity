import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { generateTotp } from '../src/pages/app/pass/totp'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
import {
  E2E_2FA_EMAIL,
  E2E_2FA_PASSWORD,
  complete2FALoginStep,
  loginWithPassword,
  loginWithTotp,
} from './fixtures/twofa'

/**
 * E2E 2FA — compte dédié `e2e-2fa@cloudity.local` (make seed-e2e-2fa).
 * Avant chaque test : `make reset-e2e-2fa` (ou script reset-user-2fa.sh).
 * N'utilise pas admin@cloudity.local pour ne pas casser auth.spec.ts.
 */
test.describe('2FA compte Cloudity (E2E)', () => {
  test.describe.configure({ mode: 'serial' })

  let totpSecret = ''
  let recoveryCode = ''

  test.beforeAll(() => {
    test.skip(
      process.env.PLAYWRIGHT_SKIP_2FA === '1',
      'PLAYWRIGHT_SKIP_2FA=1 — tests 2FA ignorés'
    )
    execSync('make seed-e2e-2fa', { cwd: REPO_ROOT, stdio: 'inherit' })
  })

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies()
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test('activation TOTP + codes de récupération dans les paramètres', async ({ page }) => {
    const step = await loginWithPassword(page, E2E_2FA_EMAIL, E2E_2FA_PASSWORD)
    expect(step, 'compte E2E doit être sans 2FA — lancer make reset-e2e-2fa && make seed-e2e-2fa').toBe('ok')

    await page.goto('/app/settings/canonical')
    await expect(page.getByRole('heading', { name: /paramètres/i })).toBeVisible()

    await page.getByRole('button', { name: /activer la 2fa/i }).click()
    await expect(page.getByText(/secret \(saisie manuelle\)/i)).toBeVisible({ timeout: 15_000 })

    totpSecret = (await page.getByTestId('twofa-setup-secret').textContent())?.trim() ?? ''
    expect(totpSecret.length).toBeGreaterThan(10)

    const code = await generateTotp({ secret: totpSecret })
    await page.getByLabel(/code de vérification/i).fill(code)
    await page.getByRole('button', { name: /confirmer et activer/i }).click()

    await expect(page.getByText(/sauvegarde ces codes/i)).toBeVisible({ timeout: 15_000 })
    recoveryCode =
      (await page.locator('.font-mono li').first().textContent())?.trim() ??
      (await page.locator('ul li').first().textContent())?.trim() ??
      ''
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/i)

    await expect(page.getByRole('main').getByText(/2FA activée/i)).toBeVisible()
  })

  test('login web : mot de passe puis code TOTP', async ({ page }) => {
    test.skip(!totpSecret, 'Dépend du test d’activation (secret TOTP manquant)')
    await loginWithTotp(page, {
      email: E2E_2FA_EMAIL,
      password: E2E_2FA_PASSWORD,
      totpSecret,
    })
    await expect(page.getByRole('heading', { name: /tableau de bord|hub|cloudity/i })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('login web : code 2FA invalide reste bloqué puis accepte le TOTP valide', async ({ page }) => {
    test.skip(!totpSecret, 'Dépend du test d’activation (secret TOTP manquant)')
    expect(await loginWithPassword(page, E2E_2FA_EMAIL, E2E_2FA_PASSWORD)).toBe('requires_2fa')

    const codeField = page.getByLabel(/code 2fa|code de récupération/i)
    await codeField.fill('000000')
    await page.getByRole('button', { name: /valider/i }).click()
    await expect(page.getByText(/code invalide|invalid code/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/authentification à 2 facteurs requise/i)).toBeVisible()

    await codeField.fill(await generateTotp({ secret: totpSecret }))
    await page.getByRole('button', { name: /valider/i }).click()
    await page.waitForURL(/\/(app|app\/)/, { timeout: 20_000 })
  })

  test('login web : code de récupération', async ({ page }) => {
    test.skip(!recoveryCode, 'Dépend du test d’activation (code récup manquant)')
    expect(await loginWithPassword(page, E2E_2FA_EMAIL, E2E_2FA_PASSWORD)).toBe('requires_2fa')
    await complete2FALoginStep(page, recoveryCode)
    await expect(page.getByText(/connexion via code de récupération/i)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/(app|app\/)/)
  })

  test('login web : un code de récupération consommé ne peut pas être réutilisé', async ({ page }) => {
    test.skip(!recoveryCode, 'Dépend du test de récupération (code manquant)')
    expect(await loginWithPassword(page, E2E_2FA_EMAIL, E2E_2FA_PASSWORD)).toBe('requires_2fa')

    await page.getByLabel(/code 2fa|code de récupération/i).fill(recoveryCode)
    await page.getByRole('button', { name: /valider/i }).click()
    await expect(page.getByText(/code invalide|invalid code/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/authentification à 2 facteurs requise/i)).toBeVisible()
  })
})
