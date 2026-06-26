import { Page } from '@playwright/test'

/** Compte démo créé par `make seed-admin` */
export const DEMO_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL || 'admin@cloudity.local'
export const DEMO_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD || 'Admin123!'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Étape 1 du login web : email puis « Continuer ». */
export async function advanceLoginToPasswordStep(page: Page, email: string): Promise<void> {
  const passwordVisible = await page
    .getByLabel(/mot de passe|password/i)
    .isVisible()
    .catch(() => false)
  if (passwordVisible) return

  await page.getByLabel(/email/i).fill(email)
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  await page.getByLabel(/mot de passe|password/i).waitFor({ state: 'visible', timeout: 10_000 })
}

/**
 * Connecte l'utilisateur via le formulaire de login (email → Continuer → mot de passe).
 * Attend la redirection vers /app (hub) ou la page demandée.
 */
export async function login(
  page: Page,
  options: { email?: string; password?: string; returnTo?: string } = {}
): Promise<void> {
  const email = options.email ?? DEMO_EMAIL
  const password = options.password ?? DEMO_PASSWORD
  const expectedURL = options.returnTo
    ? new RegExp(`${escapeRegExp(options.returnTo)}(\\/|$)`)
    : /\/(app|app\/)/

  await page.goto('/login' + (options.returnTo ? `?next=${encodeURIComponent(options.returnTo)}` : ''))
  const onLoginPage = await page.getByRole('heading', { name: /connexion/i }).isVisible().catch(() => false)
  if (!onLoginPage && expectedURL.test(page.url())) return

  await advanceLoginToPasswordStep(page, email)
  await page.getByLabel(/mot de passe|password/i).fill(password)
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
      .waitForURL(expectedURL, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (reached) return
  }
  const stillOnLoginPage = await page.getByRole('heading', { name: /connexion/i }).isVisible().catch(() => false)
  if (stillOnLoginPage) {
    const toast = page.getByText(/erreur|invalid|incorrect|requis/i).first()
    if (await toast.isVisible().catch(() => false)) {
      throw new Error(`Login échoué : ${(await toast.textContent()) ?? 'erreur UI'} — lancer make seed-admin ?`)
    }
    throw new Error(
      `Login bloqué sur /login (${email}) — vérifier make seed-admin et PLAYWRIGHT_E2E_*`,
    )
  }
  await page.waitForURL(expectedURL, { timeout: 15_000 })
}

/**
 * Vérifie si la page actuelle est la page de connexion.
 */
export async function isLoginPage(page: Page): Promise<boolean> {
  return page.getByRole('heading', { name: /connexion/i }).isVisible().catch(() => false)
}
