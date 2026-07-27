import { apiUrl } from './cloudityCore'

/** Extrait le domaine d'une URL (Pass, Mail, etc.) — partagé web / mobile / extension. */
export function passDomainFromUrl(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null
  try {
    const withScheme = raw.includes('://') ? raw : `https://${raw}`
    const u = new URL(withScheme)
    const host = u.hostname.replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

/** URL proxy favicon Mail : `GET /mail/favicon?domain=` (gateway). */
export function mailFaviconUrl(domain: string): string {
  return apiUrl(`/mail/favicon?domain=${encodeURIComponent(domain)}`)
}
