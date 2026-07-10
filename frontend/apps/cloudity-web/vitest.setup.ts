import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/** Polyfills jsdom manquants pour MailPage et composants UI lourds. */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn().mockReturnValue([])
  root = null
  rootMargin = ''
  thresholds = []
}
window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver

Element.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
})
