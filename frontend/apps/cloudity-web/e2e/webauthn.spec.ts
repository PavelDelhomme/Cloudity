import { test, expect } from '@playwright/test'
import {
  addWebAuthnVirtualAuthenticator,
  removeWebAuthnVirtualAuthenticator,
} from './fixtures/webauthn-virtual'
import { advanceLoginToPasswordStep, DEMO_EMAIL, DEMO_PASSWORD } from './fixtures/auth'

/**
 * WebAuthn / passkeys — authentificateur virtuel (CDP Chromium).
 *
 * Prérequis : `make up`, `make migrate` (migration **37**), `make seed-admin`,
 * attendre 20–30 s. Identifiants : `PLAYWRIGHT_E2E_EMAIL` / `PLAYWRIGHT_E2E_PASSWORD`
 * ou compte créé par **seed-admin** (SEED_ADMIN_* dans .env).
 *
 * Lancement ciblé : `make test-e2e-playwright-webauthn`
 */

test.beforeEach(async ({ request }) => {
  const res = await request.get('/health', { timeout: 8000 }).catch(() => null)
  test.skip(!res?.ok(), 'Stack non joignable (make up, puis /health sur le dashboard)')
})

test.describe('WebAuthn (passkeys)', () => {
  test('bouton connexion passkey visible sur /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /passkey/i })).toBeVisible({ timeout: 15_000 })
  })

  test('enregistrement passkey puis reconnexion passkey (CDP)', async ({ page }) => {
    const { cdp, authenticatorId } = await addWebAuthnVirtualAuthenticator(page)
    try {
      await page.goto('/login?next=%2F4dm1n')
      await advanceLoginToPasswordStep(page, DEMO_EMAIL)
      await page.getByLabel(/mot de passe|password/i).fill(DEMO_PASSWORD)
      await page.getByRole('button', { name: /^se connecter$/i }).click()
      await expect(page).toHaveURL(/\/4dm1n(\/|$)/, { timeout: 25_000 })

      await page.getByRole('link', { name: /^passkeys$/i }).click()
      await expect(page).toHaveURL(/\/4dm1n\/passkeys/, { timeout: 15_000 })

      page.on('dialog', (dialog) => dialog.accept())
      for (let i = 0; i < 5; i += 1) {
        const deleteButtons = page.getByRole('button', { name: /supprimer passkey/i })
        const count = await deleteButtons.count()
        if (count === 0) break
        await deleteButtons.first().click()
        await expect(deleteButtons).toHaveCount(count - 1, { timeout: 10_000 })
      }

      await page.getByRole('button', { name: /ajouter une passkey/i }).click()
      await expect(page.getByText(/passkey enregistrée/i)).toBeVisible({ timeout: 25_000 })

      await page.getByRole('button', { name: /déconnexion/i }).click()
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })

      await page.goto('/login?next=%2F4dm1n')
      await page.getByLabel(/email/i).fill(DEMO_EMAIL)
      // Phase W2 : la Conditional UI peut authentifier directement au focus
      // du champ email (autocomplete="username webauthn") via la passkey
      // résidente du virtual authenticator. Si elle réussit, la page navigue
      // avant qu'on ait à cliquer. Sinon, on déclenche le bouton manuellement.
      const conditionalNav = page
        .waitForURL(/\/4dm1n(\/|$)/, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
      if (!(await conditionalNav)) {
        await page.getByRole('button', { name: /passkey/i }).click()
      }
      await expect(page).toHaveURL(/\/4dm1n(\/|$)/, { timeout: 25_000 })
    } finally {
      await removeWebAuthnVirtualAuthenticator(cdp, authenticatorId)
    }
  })
})
