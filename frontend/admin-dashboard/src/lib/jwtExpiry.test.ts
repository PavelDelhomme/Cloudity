import { describe, it, expect } from 'vitest'
import { getJwtPayloadExpMs, isAccessTokenUsable } from './jwtExpiry'

function b64url(obj: object): string {
  const s = JSON.stringify(obj)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('jwtExpiry', () => {
  it('lit exp depuis un JWT', () => {
    const expSec = 1_700_000_000
    const token = `x.${b64url({ exp: expSec })}.y`
    expect(getJwtPayloadExpMs(token)).toBe(expSec * 1000)
  })

  it('isAccessTokenUsable false si exp trop proche', () => {
    const past = Math.floor(Date.now() / 1000) - 10
    const token = `a.${b64url({ exp: past })}.b`
    expect(isAccessTokenUsable(token, 90_000)).toBe(false)
  })

  it('isAccessTokenUsable true si exp lointain', () => {
    const future = Math.floor(Date.now() / 1000) + 7200
    const token = `a.${b64url({ exp: future })}.b`
    expect(isAccessTokenUsable(token, 90_000)).toBe(true)
  })

  it('sans exp : considéré utilisable', () => {
    const token = `a.${b64url({ sub: 'u' })}.b`
    expect(getJwtPayloadExpMs(token)).toBeNull()
    expect(isAccessTokenUsable(token)).toBe(true)
  })
})
