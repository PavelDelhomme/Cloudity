/**
 * Parse une date API Cloudity (RFC3339 ou texte PostgreSQL sans fuseau = UTC).
 */
export function parseCloudityDateTime(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(`${normalized}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Convertit la valeur d’un `<input type="datetime-local">` (heure locale) en ISO UTC.
 * Évite les ambiguïtés de `new Date(string)` sur certaines formes ISO.
 */
export function datetimeLocalInputToUtcIso(localValue: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = m[6] ? Number(m[6]) : 0
  const local = new Date(year, month, day, hour, minute, second, 0)
  if (Number.isNaN(local.getTime())) return null
  return local.toISOString()
}

/** Affichage date/heure dans le fuseau de l’utilisateur. */
export function formatCloudityDateTimeLocal(
  raw: string | undefined | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
): string {
  const d = parseCloudityDateTime(raw)
  if (!d) return '—'
  return d.toLocaleString('fr-FR', options)
}
