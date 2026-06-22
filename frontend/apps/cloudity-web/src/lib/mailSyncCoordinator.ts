/**
 * Coordonne les sync IMAP entre GlobalMailSyncWatcher, MailPage et le Hub
 * pour éviter les rafales 409 côté mail-directory-service.
 */
import { syncMailAccount, type MailAccountResponse } from '../api'

export type MailSyncResult = Awaited<ReturnType<typeof syncMailAccount>>

const inFlightAccountIds = new Set<number>()

export function isMailSyncInFlight(accountId: number): boolean {
  return inFlightAccountIds.has(accountId)
}

export async function coordinatedSyncMailAccount(
  token: string,
  accountId: number,
  password?: string,
  options?: Parameters<typeof syncMailAccount>[3]
): Promise<MailSyncResult | null> {
  if (inFlightAccountIds.has(accountId)) return null
  inFlightAccountIds.add(accountId)
  try {
    return await syncMailAccount(token, accountId, password, options)
  } finally {
    inFlightAccountIds.delete(accountId)
  }
}

export async function coordinatedSyncMailAccounts(
  token: string,
  accounts: MailAccountResponse[],
  options?: Parameters<typeof syncMailAccount>[3]
): Promise<MailSyncResult[]> {
  const results: MailSyncResult[] = []
  for (const acc of accounts) {
    const r = await coordinatedSyncMailAccount(token, acc.id, undefined, options)
    if (r) results.push(r)
  }
  return results
}
