import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contre l'app réelle (Docker: port 6001).
 * Prérequis : make up puis make seed-admin (compte admin@cloudity.local / Admin123!)
 * Lancer : BASE_URL=http://localhost:6001 npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:6001',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 45_000,
  expect: { timeout: 10_000 },
})
