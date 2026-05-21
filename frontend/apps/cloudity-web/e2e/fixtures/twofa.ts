import { Page } from '@playwright/test'
import { generateTotp } from '../../src/pages/app/pass/totp'

/** Compte dédié E2E 2FA — ne pas activer 2FA sur admin@cloudity.local */
export const E2E_2FA_EMAIL = process.env.PLAYWRIGHT_E2E_2FA_EMAIL || 'e2e-2fa@cloudity.local'
export const E2E_2FA_PASSWORD = process.env.PLAYWRIGHT_E2E_2FA_PASSWORD || 'E2faTest123!'

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string
): Promise<'ok' | 'requires_2fa'> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe|password/i).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  const outcome = await Promise.race([
    page.waitForURL(/\/(app|app\/)/, { timeout: 20_000 }).then(() => 'ok' as const),
    page
      .getByText(/authentification à 2 facteurs requise/i)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'requires_2fa' as const),
  ]).catch(() => null)
  if (outcome) return outcome
  throw new Error('Login bloqué — vérifier make seed-e2e-2fa')
}

/**
 * Complète l'étape 2FA après un login mot de passe (requires_2fa).
 */
export async function complete2FALoginStep(page: Page, code: string): Promise<void> {
  await page.getByLabel(/code 2fa|code de récupération/i).waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByLabel(/code 2fa|code de récupération/i).fill(code)
  await page.getByRole('button', { name: /valider/i }).click()
  await page.waitForURL(/\/(app|app\/)/, { timeout: 20_000 })
}

export async function loginWithTotp(
  page: Page,
  options: { email: string; password: string; totpSecret: string }
): Promise<void> {
  const step = await loginWithPassword(page, options.email, options.password)
  if (step !== 'requires_2fa') {
    throw new Error(`Login TOTP : étape 2FA attendue, reçu ${step}`)
  }
  const code = await generateTotp({ secret: options.totpSecret })
  await complete2FALoginStep(page, code)
}
