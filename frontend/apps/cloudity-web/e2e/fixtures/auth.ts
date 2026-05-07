import { Page } from '@playwright/test'

/** Compte démo créé par `make seed-admin` */
export const DEMO_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL || 'admin@cloudity.local'
export const DEMO_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD || 'Admin123!'

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
  await page.getByRole('button', { name: /se connecter|connexion/i }).click()
  await page.waitForURL(/\/(app|app\/)/, { timeout: 15000 })
}

/**
 * Vérifie si la page actuelle est la page de connexion.
 */
export async function isLoginPage(page: Page): Promise<boolean> {
  return page.getByRole('heading', { name: /connexion/i }).isVisible().catch(() => false)
}
