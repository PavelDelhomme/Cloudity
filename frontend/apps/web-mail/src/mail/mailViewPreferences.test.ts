import { describe, it, expect, beforeEach } from 'vitest'
import { loadMailViewState, saveMailViewState } from './mailViewPreferences'

describe('mailViewPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persiste boîte et dossier par tenant + email', () => {
    saveMailViewState(1, 'User@Test.com', { accountId: 42, folder: 'unified' })
    expect(loadMailViewState(1, 'user@test.com')).toEqual({ accountId: 42, folder: 'unified' })
    expect(loadMailViewState(2, 'user@test.com')).toEqual({ accountId: null, folder: 'inbox' })
  })

  it('migre l’ancienne clé account-only', () => {
    localStorage.setItem('cloudity_mail_selected_account_id', '7')
    expect(loadMailViewState(1, 'a@test.com')).toEqual({ accountId: 7, folder: 'inbox' })
  })
})
