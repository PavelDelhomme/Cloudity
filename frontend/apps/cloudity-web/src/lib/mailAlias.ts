/** Domaine d’alias (partie après @), ex. alias.exemple.ovh — préférence navigateur. */
export const ALIAS_HOST_SUFFIX_STORAGE_KEY = 'cloudity.mail.aliasHostSuffix'

export type MailAliasConfigResponse = {
  primary_domain?: string
  alias_host_suffix?: string
  validation_strict: boolean
  env_configured: boolean
}

export function getStoredAliasHostSuffix(): string | null {
  try {
    const v = localStorage.getItem(ALIAS_HOST_SUFFIX_STORAGE_KEY)?.trim().toLowerCase()
    if (!v) return null
    return v.replace(/^@+/, '')
  } catch {
    return null
  }
}

export function setStoredAliasHostSuffix(suffix: string): void {
  const v = suffix.trim().toLowerCase().replace(/^@+/, '')
  if (!v) {
    localStorage.removeItem(ALIAS_HOST_SUFFIX_STORAGE_KEY)
    return
  }
  localStorage.setItem(ALIAS_HOST_SUFFIX_STORAGE_KEY, v)
}

export function clearStoredAliasHostSuffix(): void {
  localStorage.removeItem(ALIAS_HOST_SUFFIX_STORAGE_KEY)
}

export function accountEmailDomain(email: string | undefined): string | undefined {
  if (!email?.includes('@')) return undefined
  return email.split('@').pop()?.trim().toLowerCase() || undefined
}

/** Suffixe effectif : préférence locale → API → alias.&lt;domaine boîte&gt;. */
export function effectiveAliasHostSuffix(
  server: MailAliasConfigResponse | undefined,
  accountEmail?: string
): string {
  const stored = getStoredAliasHostSuffix()
  if (stored) return stored
  const fromApi = server?.alias_host_suffix?.trim().toLowerCase()
  if (fromApi) return fromApi.replace(/^@+/, '')
  const dom = accountEmailDomain(accountEmail)
  if (dom) return `alias.${dom}`
  return ''
}

/** Transforme une saisie (local-part ou adresse complète) en adresse alias. */
export function resolveAliasEmailInput(raw: string, suffix: string): string {
  const t = raw.trim().toLowerCase()
  if (!t) return ''
  if (t.includes('@')) return t
  const sfx = suffix.trim().toLowerCase().replace(/^@+/, '')
  if (!sfx) return t
  const local = t.replace(/[^a-z0-9._+-]/g, '')
  return local ? `${local}@${sfx}` : ''
}
