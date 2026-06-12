import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppLockedGate } from './AppLockedGate'
import { clearAppLockedVault, setupAppLockedPin } from './appLockedVault'

const SCOPE = '1:notes:user@test.com'

describe('AppLockedGate', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearAppLockedVault('notes', SCOPE)
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: undefined,
    })
  })

  it('refuse un code incorrect sans déverrouiller', async () => {
    await setupAppLockedPin('notes', SCOPE, '1234', '1234')
    const onUnlocked = vi.fn()
    render(
      <AppLockedGate
        kind="notes"
        scope={SCOPE}
        appLabel="Notes"
        description="Test"
        onUnlocked={onUnlocked}
      />
    )

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller avec le code' }))

    await screen.findByText('Code incorrect.')
    expect(onUnlocked).not.toHaveBeenCalled()
  })

  it('déverrouille avec le bon code', async () => {
    await setupAppLockedPin('notes', SCOPE, '1234', '1234')
    const onUnlocked = vi.fn()
    render(
      <AppLockedGate
        kind="notes"
        scope={SCOPE}
        appLabel="Notes"
        description="Test"
        onUnlocked={onUnlocked}
      />
    )

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller avec le code' }))

    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledTimes(1)
    })
  })
})
