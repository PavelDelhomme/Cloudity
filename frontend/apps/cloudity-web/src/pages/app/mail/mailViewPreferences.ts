import type { MailFolderId } from '../../../api'

export type MailViewState = {
  accountId: number | null
  folder: MailFolderId
}

const LEGACY_ACCOUNT_KEY = 'cloudity_mail_selected_account_id'

const STANDARD_FOLDERS = new Set<MailFolderId>([
  'inbox',
  'sent',
  'drafts',
  'archive',
  'spam',
  'trash',
  'all',
  'unified',
  'scheduled',
])

function scopedKey(tenantId: number | null | undefined, email: string | null | undefined): string {
  const t = tenantId ?? 0
  const e = (email ?? '').trim().toLowerCase()
  return `cloudity.mail.view.v1:${t}:${e}`
}

function parseFolder(raw: unknown): MailFolderId {
  if (typeof raw !== 'string' || !raw.trim()) return 'inbox'
  const f = raw.trim() as MailFolderId
  if (STANDARD_FOLDERS.has(f)) return f
  // Dossier IMAP personnalisé (chemin libre)
  if (f.length > 0 && f.length <= 512) return f
  return 'inbox'
}

function migrateLegacyAccountId(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_ACCOUNT_KEY)
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function loadMailViewState(
  tenantId: number | null | undefined,
  email: string | null | undefined
): MailViewState {
  const fallback: MailViewState = {
    accountId: migrateLegacyAccountId(),
    folder: 'inbox',
  }
  try {
    const raw = localStorage.getItem(scopedKey(tenantId, email))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<MailViewState>
    const accountId =
      typeof parsed.accountId === 'number' && parsed.accountId > 0 ? parsed.accountId : fallback.accountId
    return {
      accountId,
      folder: parseFolder(parsed.folder),
    }
  } catch {
    return fallback
  }
}

export function saveMailViewState(
  tenantId: number | null | undefined,
  email: string | null | undefined,
  state: MailViewState
): void {
  try {
    localStorage.setItem(
      scopedKey(tenantId, email),
      JSON.stringify({
        accountId: state.accountId,
        folder: state.folder,
      })
    )
  } catch {
    /* quota / mode privé */
  }
}

/** @deprecated Préférer loadMailViewState — conservé pour tests / compat. */
export function getSavedMailSelectedAccountId(): number | null {
  return migrateLegacyAccountId()
}

/** @deprecated Préférer saveMailViewState */
export function saveMailSelectedAccountId(accountId: number | null): void {
  try {
    if (accountId == null) localStorage.removeItem(LEGACY_ACCOUNT_KEY)
    else localStorage.setItem(LEGACY_ACCOUNT_KEY, String(accountId))
  } catch {
    /* ignore */
  }
}
