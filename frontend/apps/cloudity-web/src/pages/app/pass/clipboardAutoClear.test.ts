import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyWithAutoClear } from './clipboardAutoClear'

/**
 * Tests du presse-papiers auto-clear. On mock `navigator.clipboard` pour
 * éviter toute dépendance jsdom (qui par défaut n'expose pas l'API).
 */
describe('copyWithAutoClear', () => {
  let writeText: ReturnType<typeof vi.fn>
  let readText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn().mockResolvedValue(undefined)
    readText = vi.fn()
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('écrit immédiatement la valeur dans le presse-papiers', async () => {
    await copyWithAutoClear('secret-pwd', { ttlMs: 1_000 })
    expect(writeText).toHaveBeenCalledWith('secret-pwd')
  })

  it('efface après ttlMs si la valeur est encore là', async () => {
    readText.mockResolvedValue('secret-pwd')
    const onCleared = vi.fn()
    await copyWithAutoClear('secret-pwd', { ttlMs: 5_000, onCleared })

    // Avant le délai : pas d'effacement.
    expect(writeText).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(readText).toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith('') // effacement
    expect(onCleared).toHaveBeenCalled()
  })

  it("n'écrase pas un copier-coller ultérieur fait par l'utilisateur", async () => {
    readText.mockResolvedValue('autre-chose-collée-entretemps')
    const onCleared = vi.fn()
    await copyWithAutoClear('secret-pwd', { ttlMs: 5_000, onCleared })

    await vi.advanceTimersByTimeAsync(5_000)

    expect(readText).toHaveBeenCalled()
    // writeText('') ne doit PAS avoir été appelé
    expect(writeText).toHaveBeenCalledTimes(1) // que le 1er writeText (set initial)
    expect(onCleared).not.toHaveBeenCalled()
  })

  it('cancel() empêche l\'auto-clear ultérieur', async () => {
    readText.mockResolvedValue('secret-pwd')
    const onCleared = vi.fn()
    const cancel = await copyWithAutoClear('secret-pwd', { ttlMs: 5_000, onCleared })
    cancel()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(readText).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(onCleared).not.toHaveBeenCalled()
  })

  it('tente un overwrite blind si readText() lève (Firefox/Safari sans geste user)', async () => {
    readText.mockRejectedValue(new DOMException('Permission denied'))
    const onCleared = vi.fn()
    await copyWithAutoClear('secret-pwd', { ttlMs: 5_000, onCleared })

    await vi.advanceTimersByTimeAsync(5_000)

    // 1er writeText = set, 2e writeText = overwrite blind à ''
    expect(writeText).toHaveBeenNthCalledWith(1, 'secret-pwd')
    expect(writeText).toHaveBeenNthCalledWith(2, '')
    expect(onCleared).toHaveBeenCalled()
  })
})
