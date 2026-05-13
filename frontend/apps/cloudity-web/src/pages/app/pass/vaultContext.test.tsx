import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { AUTO_LOCK_AFTER_MS, VaultProvider, useVault } from './vaultContext'

/**
 * Tests d'intégration légers sur `vaultContext`. On stub `deriveMasterKey`
 * pour éviter les ~1 s d'Argon2id par test (jsdom n'a pas d'instance WASM
 * réutilisable, ça multiplierait la durée de la suite). On vérifie :
 *  - lock par défaut
 *  - unlock pose la MK + état
 *  - lock zeroïse la MK
 *  - auto-lock après AUTO_LOCK_AFTER_MS d'inactivité (timers fake)
 */

const MOCK_MK_VALUE = 0xab

vi.mock('@cloudity/pass-crypto', async (importActual) => {
  const real = await importActual<typeof import('@cloudity/pass-crypto')>()
  return {
    ...real,
    deriveMasterKey: vi.fn(async () => new Uint8Array(32).fill(MOCK_MK_VALUE)),
  }
})

function Probe() {
  const { state, unlock, lock } = useVault()
  return (
    <div>
      <div data-testid="status">{state.status}</div>
      {state.status === 'unlocked' && (
        <div data-testid="mk-first">{state.masterKey[0]}</div>
      )}
      <button onClick={() => void unlock('master-pw', 7).catch(() => {})}>
        do-unlock
      </button>
      <button onClick={lock}>do-lock</button>
    </div>
  )
}

describe('VaultProvider / useVault', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('démarre verrouillé', () => {
    render(
      <VaultProvider>
        <Probe />
      </VaultProvider>
    )
    expect(screen.getByTestId('status').textContent).toBe('locked')
  })

  it('unlock pose la master key, lock la zeroïse', async () => {
    render(
      <VaultProvider>
        <Probe />
      </VaultProvider>
    )
    await act(async () => {
      screen.getByText('do-unlock').click()
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId('status').textContent).toBe('unlocked')
    expect(screen.getByTestId('mk-first').textContent).toBe(String(MOCK_MK_VALUE))

    await act(async () => {
      screen.getByText('do-lock').click()
    })
    expect(screen.getByTestId('status').textContent).toBe('locked')
    // mk-first n'est plus dans le DOM (pas d'unlocked state)
    expect(screen.queryByTestId('mk-first')).toBeNull()
  })

  it('auto-lock après AUTO_LOCK_AFTER_MS d\'inactivité', async () => {
    render(
      <VaultProvider>
        <Probe />
      </VaultProvider>
    )
    await act(async () => {
      screen.getByText('do-unlock').click()
      await vi.runAllTimersAsync()
    })
    expect(screen.getByTestId('status').textContent).toBe('unlocked')

    // Avance bien au-delà du seuil sans simuler aucune activité (pas de keydown/mousemove).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_LOCK_AFTER_MS + 30_000)
    })

    expect(screen.getByTestId('status').textContent).toBe('locked')
  })
})
