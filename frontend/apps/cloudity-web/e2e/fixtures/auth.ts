import { Page } from '@playwright/test'

/** Compte démo créé par `make seed-admin` */
export const DEMO_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL || 'admin@cloudity.local'
export const DEMO_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD || 'Admin123!'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Connecte l'utilisateur via le formulaire de login.
 * Attend la redirection vers /app (hub) ou la page demandée.
 */
export async function login(
  page: Page,
  options: { email?: string; password?: string; returnTo?: string } = {}
): Promise<void> {
  const email = options.email ?? DEMO_EMAIL
  const password = options.password ?? DEMO_PASSWORD
  await page.goto('/login' + (options.returnTo ? `?next=${encodeURIComponent(options.returnTo)}` : ''))
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe|password/i).fill(password)
  // Le formulaire expose désormais 2 boutons (mot de passe + passkey).
  // On cible exactement le bouton submit "Se connecter" (sans "avec une passkey").
  const expectedURL = options.returnTo
    ? new RegExp(`${escapeRegExp(options.returnTo)}(\\/|$)`)
    : /\/(app|app\/)/
  const submit = page.getByRole('button', { name: 'Se connecter', exact: true })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt === 0) {
      await submit.click()
    } else if (attempt === 1) {
      await page.getByLabel(/mot de passe|password/i).press('Enter')
    } else {
      await submit.click({ force: true })
    }
    const reached = await page
      .waitForURL(expectedURL, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (reached) return
  }
  await page.waitForURL(expectedURL, { timeout: 1_000 })
}

/**
 * Vérifie si la page actuelle est la page de connexion.
 */
export async function isLoginPage(page: Page): Promise<boolean> {
  return page.getByRole('heading', { name: /connexion/i }).isVisible().catch(() => false)
}
