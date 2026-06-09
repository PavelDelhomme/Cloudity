import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AUTH_STORAGE_KEY } from '@cloudity/shared'

vi.mock('./api', () => ({
  refreshAuth: vi.fn(),
}))

import { refreshAuth } from './api'
import { refreshSessionExclusive } from './authSessionRefresh'

const refreshAuthMock = vi.mocked(refreshAuth)

function jwtWithExp(expSec: number): string {
  const payload = btoa(JSON.stringify({ exp: expSec })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `hdr.${payload}.sig`
}

describe('refreshSessionExclusive', () => {
  beforeEach(() => {
    localStorage.clear()
    refreshAuthMock.mockReset()
  })

  it('ne rappelle pas /auth/refresh si le JWT est encore valable', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: jwtWithExp(exp),
        refreshToken: 'rt-1',
        tenantId: 1,
        email: 'u@test.com',
      })
    )

    const result = await refreshSessionExclusive()
    expect(refreshAuthMock).not.toHaveBeenCalled()
    expect(result?.accessToken).toBe(jwtWithExp(exp))
  })

  it('déduplique les appels parallèles (rotation refresh token)', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: jwtWithExp(exp),
        refreshToken: 'rt-old',
        tenantId: 1,
        email: 'u@test.com',
      })
    )

    refreshAuthMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                access_token: jwtWithExp(Math.floor(Date.now() / 1000) + 3600),
                refresh_token: 'rt-new',
              }),
            30
          )
        })
    )

    const [a, b] = await Promise.all([refreshSessionExclusive(), refreshSessionExclusive()])
    expect(refreshAuthMock).toHaveBeenCalledTimes(1)
    expect(a?.refreshToken).toBe('rt-new')
    expect(b?.refreshToken).toBe('rt-new')
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}')
    expect(stored.refreshToken).toBe('rt-new')
  })

  it('force le refresh même si le JWT semble encore valable', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: jwtWithExp(exp),
        refreshToken: 'rt-old',
        tenantId: 1,
        email: 'u@test.com',
      })
    )
    refreshAuthMock.mockResolvedValue({
      access_token: jwtWithExp(exp + 7200),
      refresh_token: 'rt-new',
    })

    await refreshSessionExclusive({ force: true })
    expect(refreshAuthMock).toHaveBeenCalledTimes(1)
    expect(refreshAuthMock).toHaveBeenCalledWith('rt-old')
  })
})
