import { describe, expect, it } from 'vitest'
import { mailGmailOAuthDoc, mailGmailSetupHint } from './mailGmailSetup'

describe('aide Gmail de la modale', () => {
  it('quand OAuth est inactif, nomme les variables et le guide', () => {
    const hint = mailGmailSetupHint(false)
    expect(hint).toContain('GOOGLE_OAUTH_CLIENT_ID')
    expect(hint).toContain('GOOGLE_OAUTH_CLIENT_SECRET')
    expect(hint).toContain('GOOGLE_OAUTH_REDIRECT_URI')
    expect(hint).toContain('MAIL_OAUTH_FRONTEND_URL')
    expect(hint).toContain('/mail/me/oauth/google/callback')
    expect(hint).toContain('https://mail.google.com/')
    expect(hint).toContain(mailGmailOAuthDoc)
    expect(hint).not.toMatch(/GOCSPX-[A-Za-z0-9]/)
  })

  it('quand OAuth est actif, explique le retour, pas la config serveur', () => {
    const hint = mailGmailSetupHint(true)
    expect(hint).toContain('Fenêtre Google')
    expect(hint).not.toContain('GOOGLE_OAUTH_CLIENT_SECRET')
  })
})
