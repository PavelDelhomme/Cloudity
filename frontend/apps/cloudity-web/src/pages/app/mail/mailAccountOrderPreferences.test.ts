import { describe, it, expect, beforeEach } from 'vitest'
import { sortMailAccountsByUserOrder, saveMailAccountOrder, loadMailAccountOrder } from './mailAccountOrderPreferences'

describe('mailAccountOrderPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('trie les boîtes selon ordre utilisateur', () => {
    const accounts = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(sortMailAccountsByUserOrder(accounts, [3, 1, 2]).map((a) => a.id)).toEqual([3, 1, 2])
  })

  it('persiste ordre par tenant + email', () => {
    saveMailAccountOrder(1, 'a@test.com', [2, 1])
    expect(loadMailAccountOrder(1, 'a@test.com')).toEqual([2, 1])
  })
})
