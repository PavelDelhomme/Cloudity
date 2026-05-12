import type { BrowserContext, Page } from '@playwright/test'

type CDPSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>

/**
 * Active l’authentificateur virtuel Chrome (protocole WebAuthn CDP).
 * Prérequis : projet **chromium** uniquement.
 *
 * @see https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
 */
export async function addWebAuthnVirtualAuthenticator(page: Page): Promise<{
  cdp: CDPSession
  authenticatorId: string
}> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const res = (await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })) as { authenticatorId: string }
  return { cdp, authenticatorId: res.authenticatorId }
}

export async function removeWebAuthnVirtualAuthenticator(
  cdp: CDPSession,
  authenticatorId: string,
): Promise<void> {
  try {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
  } finally {
    await cdp.detach().catch(() => {})
  }
}
