import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contre l'app réelle (Docker: port 6001).
 * Lancer l'app (make up) puis: npx playwright test
 * BASE_URL=http://localhost:6001 npx playwright test (par défaut)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:6001',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 30_000,
})
