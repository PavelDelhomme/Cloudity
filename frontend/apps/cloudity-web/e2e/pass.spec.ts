import { test, expect } from '@playwright/test'
import { login, DEMO_PASSWORD } from './fixtures/auth'
import { cleanupPassE2EVaultsFromPage } from './fixtures/pass-cleanup'

/**
 * Tests E2E Pass — flux complet (déverrouillage → CRUD → import Proton →
 * lecture TOTP).
 *
 * Pré-requis : `make seed-admin` (crée admin@cloudity.local) — le mot de passe
 * Cloudity sert aussi de mot de passe maître pour la démo, mais en prod ils
 * peuvent être distincts (cf. docs/securite/PASS-CRYPTO.md § 1.1).
 *
 * Le test ne dépend pas du contenu serveur — il crée son propre coffre à chaque
 * run (préfixe `e2e-` / `e2e-import-`). Après chaque test, `afterEach` appelle
 * l’API **`DELETE /pass/vaults/:id`** pour les coffres `e2e-*` (token
 * `localStorage`). Variable **`PLAYWRIGHT_API_URL`** si le gateway n’est pas sur
 * **http://localhost:6080**. À défaut : **`make clean-pass-e2e-vaults`**.
 */

const MASTER_PASSWORD = process.env.PLAYWRIGHT_E2E_MASTER ?? DEMO_PASSWORD

test.describe('Pass (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { returnTo: '/app/pass' })
    await page.goto('/app/pass')
    await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible({ timeout: 10000 })
  })

  test.afterEach(async ({ page }) => {
    await cleanupPassE2EVaultsFromPage(page)
  })

  test('page Pass affiche le titre et l\'écran de déverrouillage', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pass' })).toBeVisible()
    await expect(page.getByText(/Coffre verrouillé/)).toBeVisible()
    await expect(page.getByLabel(/Mot de passe maître/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Déverrouiller/ })).toBeVisible()
  })

  test('déverrouillage + création vault + ajout d\'1 entrée + lecture', async ({ page }) => {
    await page.getByLabel(/Mot de passe maître/).fill(MASTER_PASSWORD)
    await page.getByRole('button', { name: /Déverrouiller/ }).click()
    // Toast "Coffre déverrouillé" + l'écran change.
    await expect(page.getByText(/Coffre déverrouillé/)).toBeVisible({ timeout: 30_000 })

    // Crée un vault e2e unique pour ne pas polluer.
    const vaultName = `e2e-${Date.now()}`
    await page.getByPlaceholder(/Nouveau coffre/).fill(vaultName)
    await page.getByRole('button', { name: 'Créer un coffre' }).click()
    await expect(page.getByText('Coffre créé')).toBeVisible()

    // Sélectionne le vault qu'on vient de créer.
    await page.getByRole('button').filter({ hasText: vaultName }).click()

    // Crée une nouvelle entrée.
    await page.getByRole('button', { name: /Nouvelle entrée/ }).click()
    await page.getByLabel('Titre').fill('E2E test entry')
    // Les champs URL/Utilisateur partagent leur libellé avec un bouton (Ouvrir / Copier)
    // → on cible explicitement le rôle "textbox".
    await page.getByRole('textbox', { name: 'URL' }).fill('https://example.org/login')
    await page.getByRole('textbox', { name: 'Utilisateur' }).fill('e2e@example.org')
    await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('e2e-pwd-123!')
    // Le bouton submit du formulaire est exactement "Créer" (le bouton du
    // header s'appelle "Créer un coffre" — on évite la collision via exact).
    await page.getByRole('button', { name: 'Créer', exact: true }).click()

    await expect(page.getByText(/Entrée chiffrée \+ enregistrée/)).toBeVisible()

    // L'entrée est maintenant visible dans la liste, déchiffrée localement.
    await expect(page.getByText('E2E test entry')).toBeVisible()
    await expect(page.getByText('e2e@example.org')).toBeVisible()
  })

  test('verrouillage manuel efface la session', async ({ page }) => {
    await page.getByLabel(/Mot de passe maître/).fill(MASTER_PASSWORD)
    await page.getByRole('button', { name: /Déverrouiller/ }).click()
    await expect(page.getByText(/Coffre déverrouillé/)).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Verrouiller le coffre' }).click()
    await expect(page.getByText(/Coffre verrouillé/)).toBeVisible()
    await expect(page.getByLabel(/Mot de passe maître/)).toBeVisible()
  })

  test('import Proton JSON minimal (3 entrées)', async ({ page }) => {
    await page.getByLabel(/Mot de passe maître/).fill(MASTER_PASSWORD)
    await page.getByRole('button', { name: /Déverrouiller/ }).click()
    await expect(page.getByText(/Coffre déverrouillé/)).toBeVisible({ timeout: 30_000 })

    const vaultName = `e2e-import-${Date.now()}`
    await page.getByPlaceholder(/Nouveau coffre/).fill(vaultName)
    await page.getByRole('button', { name: 'Créer un coffre' }).click()
    await page.getByRole('button').filter({ hasText: vaultName }).click()

    // Ouvre le dialogue d'import.
    await page.getByRole('button', { name: /Importer Proton/ }).click()
    await expect(page.getByRole('heading', { name: /Importer depuis Proton Pass/ })).toBeVisible()

    // Drop d'un export Proton JSON synthétique (3 entrées).
    const protonExport = {
      version: '1.21.0',
      encrypted: false,
      vaults: {
        'vault-imp': {
          name: 'Personal',
          items: [
            {
              itemId: 'i1',
              data: {
                type: 'login',
                metadata: { name: 'Acme Login' },
                content: {
                  username: 'a@b.com',
                  password: 'p1',
                  urls: ['https://acme.example'],
                  totpUri: 'otpauth://totp/Acme:a@b.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
                },
              },
            },
            {
              itemId: 'i2',
              data: {
                type: 'login',
                metadata: { name: 'Foo Login' },
                content: { username: 'f@b.com', password: 'p2', urls: ['https://foo.example'] },
              },
            },
            {
              itemId: 'i3',
              data: {
                type: 'note',
                metadata: { name: 'Wifi Maison', note: 'SSID: home, pwd: secret' },
                content: {},
              },
            },
          ],
        },
      },
    }
    const blob = JSON.stringify(protonExport)
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByText('ou parcourir').click()
    const chooser = await fileChooserPromise
    await chooser.setFiles({
      name: 'proton-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(blob, 'utf-8'),
    })

    await expect(page.getByText(/3 entrée\(s\) prêtes à importer/)).toBeVisible()
    await page.getByRole('button', { name: /Importer 3 entrée\(s\)/ }).click()

    await expect(page.getByText(/3 entrée\(s\) importée\(s\) avec succès/)).toBeVisible({
      timeout: 20_000,
    })

    // Les 3 entrées doivent apparaître dans la liste, déchiffrées.
    await expect(page.getByText('Acme Login')).toBeVisible()
    await expect(page.getByText('Foo Login')).toBeVisible()
    await expect(page.getByText('Wifi Maison')).toBeVisible()
  })
})
