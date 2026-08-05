import { describe, expect, it, beforeEach } from 'vitest'
import {
  accountCanBackgroundImapSync,
  accountHasSyncIssue,
  clearMailSyncPasswordPrompt,
  isMailSyncAuthFailureError,
  isMailSyncPasswordRequiredError,
  markMailSyncPasswordPrompted,
  shouldPromptMailSyncPassword,
} from './mailSyncHelpers'

describe('mailSyncHelpers', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('detecte erreur mot de passe requis', () => {
    expect(
      isMailSyncPasswordRequiredError(new Error('mot de passe requis pour la synchronisation'))
    ).toBe(true)
  })

  it('detecte echec auth IMAP (mot de passe change)', () => {
    expect(
      isMailSyncAuthFailureError(new Error('Identifiants refusés ou serveur IMAP injoignable'))
    ).toBe(true)
    expect(isMailSyncAuthFailureError(new Error('OAuth Google expiré ou révoqué'))).toBe(true)
  })

  it('accountHasSyncIssue combine last_sync_error et imap_auth_ready', () => {
    expect(accountHasSyncIssue({ imap_auth_ready: true })).toBe(false)
    expect(accountHasSyncIssue({ imap_auth_ready: false })).toBe(true)
    expect(accountHasSyncIssue({ last_sync_error: 'Identifiants refusés' })).toBe(true)
  })

  it('accountCanBackgroundImapSync respecte imap_auth_ready', () => {
    expect(accountCanBackgroundImapSync({ imap_auth_ready: true })).toBe(true)
    expect(accountCanBackgroundImapSync({ imap_auth_ready: false })).toBe(false)
    expect(accountCanBackgroundImapSync({})).toBe(true)
  })

  it('ne reprompt qu une fois par session', () => {
    expect(shouldPromptMailSyncPassword(10)).toBe(true)
    markMailSyncPasswordPrompted(10)
    expect(shouldPromptMailSyncPassword(10)).toBe(false)
    clearMailSyncPasswordPrompt(10)
    expect(shouldPromptMailSyncPassword(10)).toBe(true)
  })
})
