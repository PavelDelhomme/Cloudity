import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PhotosLockedGate } from './PhotosLockedGate'
import { clearPhotosLockedVault, setupPhotosLockedPin } from './photosLockedVault'

const SCOPE = '1:user@test.com'

function mockWebAuthn(createImpl: () => Promise<unknown>, getImpl: () => Promise<unknown>) {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  })
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn(createImpl),
      get: vi.fn(getImpl),
    },
  })
}

describe('PhotosLockedGate', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearPhotosLockedVault(SCOPE)
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
    await setupPhotosLockedPin(SCOPE, '1234', '1234')
    const onUnlocked = vi.fn()
    render(<PhotosLockedGate scope={SCOPE} onUnlocked={onUnlocked} />)

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller avec le code' }))

    await screen.findByText('Code incorrect.')
    expect(onUnlocked).not.toHaveBeenCalled()
  })

  it('garde le coffre fermé si la biométrie est annulée', async () => {
    await setupPhotosLockedPin(SCOPE, '1234', '1234')
    mockWebAuthn(
      async () => ({ rawId: new Uint8Array([1, 2, 3]).buffer }),
      async () => {
        throw new Error('annulé')
      }
    )
    const onUnlocked = vi.fn()
    render(<PhotosLockedGate scope={SCOPE} onUnlocked={onUnlocked} />)

    fireEvent.click(screen.getByRole('button', { name: 'Activer empreinte / visage' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Déverrouiller avec biométrie' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller avec biométrie' }))

    await screen.findByText('Déverrouillage biométrique annulé ou indisponible.')
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})
