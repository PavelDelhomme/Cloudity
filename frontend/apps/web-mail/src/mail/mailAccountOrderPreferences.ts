export function loadMailAccountOrder(
  tenantId: number | null | undefined,
  email: string | null | undefined
): number[] {
  try {
    const t = tenantId ?? 0
    const e = (email ?? '').trim().toLowerCase()
    const raw = localStorage.getItem(`cloudity.mail.account-order.v1:${t}:${e}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is number => typeof id === 'number' && id > 0)
  } catch {
    return []
  }
}

export function saveMailAccountOrder(
  tenantId: number | null | undefined,
  email: string | null | undefined,
  orderedIds: number[]
): void {
  try {
    const t = tenantId ?? 0
    const e = (email ?? '').trim().toLowerCase()
    localStorage.setItem(`cloudity.mail.account-order.v1:${t}:${e}`, JSON.stringify(orderedIds))
  } catch {
    /* ignore */
  }
}

export function sortMailAccountsByUserOrder<T extends { id: number }>(
  accounts: T[],
  order: number[]
): T[] {
  if (order.length === 0) return accounts
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...accounts].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return a.id - b.id
  })
}

export type MailListSortOrder = 'desc' | 'asc'

export function loadMailListSortOrder(
  tenantId: number | null | undefined,
  email: string | null | undefined,
  folder: string
): MailListSortOrder {
  try {
    const t = tenantId ?? 0
    const e = (email ?? '').trim().toLowerCase()
    const f = folder.trim().toLowerCase() || 'inbox'
    const raw = localStorage.getItem(`cloudity.mail.list-sort.v1:${t}:${e}:${f}`)
    return raw === 'asc' ? 'asc' : 'desc'
  } catch {
    return 'desc'
  }
}

export function saveMailListSortOrder(
  tenantId: number | null | undefined,
  email: string | null | undefined,
  folder: string,
  order: MailListSortOrder
): void {
  try {
    const t = tenantId ?? 0
    const e = (email ?? '').trim().toLowerCase()
    const f = folder.trim().toLowerCase() || 'inbox'
    localStorage.setItem(`cloudity.mail.list-sort.v1:${t}:${e}:${f}`, order)
  } catch {
    /* ignore */
  }
}
