/** Parse d’exports type Google Contacts (CSV), JSON générique, ou tableau HTML. */

export type ParsedImportContact = { name: string; email: string; phone?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normEmail(s: string): string {
  return s.trim().toLowerCase()
}

function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(normEmail(s))
}

/** Découpe une ligne CSV en respectant les guillemets RFC de base. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      q = !q
      continue
    }
    if (!q && ch === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function headerMatch(h: string, needles: string[]): boolean {
  const x = h.trim().toLowerCase()
  return needles.every((n) => x.includes(n))
}

function pickEmailColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase()
    if (h === 'email' || h === 'e-mail' || h === 'courriel' || h === 'mail') return i
    if (h.includes('e-mail') && h.includes('value')) return i
    if (h.includes('email') && h.includes('value')) return i
  }
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim().toLowerCase().includes('email')) return i
  }
  return -1
}

function pickPhoneColumnIndex(headers: string[]): number {
  let best = -1
  let bestN = 99
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase()
    if (!h.includes('phone') && !h.includes('téléphone') && !h.includes('telephone') && !h.includes('mobile')) continue
    if (h.includes('value')) {
      const m = h.match(/(\d+)/)
      const n = m ? parseInt(m[1], 10) : 0
      if (n < bestN) {
        bestN = n
        best = i
      }
    }
  }
  if (best >= 0) return best
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase()
    if (h === 'phone' || h === 'téléphone' || h === 'telephone' || h === 'mobile') return i
  }
  return -1
}

function pickNameFromRow(headers: string[], cells: string[]): string {
  const idx = (label: string) => headers.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase())
  const given = idx('given name') >= 0 ? cells[idx('given name')]?.trim() : ''
  const family = idx('family name') >= 0 ? cells[idx('family name')]?.trim() : ''
  const combined = [given, family].filter(Boolean).join(' ').trim()
  if (combined) return combined
  const nameIdx = idx('name')
  if (nameIdx >= 0 && cells[nameIdx]?.trim()) return cells[nameIdx].trim()
  const displayIdx = headers.findIndex((h) => headerMatch(h, ['display', 'name']))
  if (displayIdx >= 0 && cells[displayIdx]?.trim()) return cells[displayIdx].trim()
  return ''
}

export function parseContactsFromCsv(text: string): ParsedImportContact[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((s) => s.replace(/^\ufeff/, '').trim())
  const emailIdx = pickEmailColumnIndex(headers)
  if (emailIdx < 0) return []
  const phoneIdx = pickPhoneColumnIndex(headers)
  const out: ParsedImportContact[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r])
    const emailRaw = cells[emailIdx]?.trim() ?? ''
    if (!emailRaw || !isValidEmail(emailRaw)) continue
    const name = pickNameFromRow(headers, cells) || emailRaw
    const phone = phoneIdx >= 0 ? (cells[phoneIdx]?.trim() || undefined) : undefined
    out.push({ name, email: normEmail(emailRaw), phone: phone || undefined })
  }
  return out
}

function extractFromPlainObject(o: Record<string, unknown>): ParsedImportContact | null {
  const emailVal =
    (typeof o.email === 'string' && o.email) ||
    (typeof o.Email === 'string' && o.Email) ||
    (typeof o.mail === 'string' && o.mail) ||
    ''
  if (!emailVal || !isValidEmail(emailVal)) return null
  const nameVal =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof o.Name === 'string' && o.Name.trim()) ||
    (typeof o.fullName === 'string' && o.fullName.trim()) ||
    (typeof o.displayName === 'string' && o.displayName.trim()) ||
    normEmail(emailVal)
  const phoneVal =
    (typeof o.phone === 'string' && o.phone.trim()) ||
    (typeof o.Phone === 'string' && o.Phone.trim()) ||
    (typeof o.mobile === 'string' && o.mobile.trim()) ||
    undefined
  return { name: nameVal, email: normEmail(emailVal), phone: phoneVal || undefined }
}

function parseGoogleConnection(c: unknown): ParsedImportContact[] {
  if (!c || typeof c !== 'object') return []
  const o = c as Record<string, unknown>
  const emails = o.emailAddresses
  if (!Array.isArray(emails) || emails.length === 0) return []
  let display = ''
  const names = o.names
  if (Array.isArray(names) && names[0] && typeof names[0] === 'object') {
    const n0 = names[0] as Record<string, unknown>
    if (typeof n0.displayName === 'string') display = n0.displayName.trim()
    else {
      const g = typeof n0.givenName === 'string' ? n0.givenName : ''
      const f = typeof n0.familyName === 'string' ? n0.familyName : ''
      display = `${g} ${f}`.trim()
    }
  }
  let phone: string | undefined
  const phones = o.phoneNumbers
  if (Array.isArray(phones) && phones[0] && typeof phones[0] === 'object') {
    const p0 = phones[0] as Record<string, unknown>
    if (typeof p0.value === 'string') phone = p0.value.trim()
  }
  const out: ParsedImportContact[] = []
  for (const e of emails) {
    if (!e || typeof e !== 'object') continue
    const val = (e as Record<string, unknown>).value
    if (typeof val !== 'string' || !isValidEmail(val)) continue
    out.push({
      name: display || normEmail(val),
      email: normEmail(val),
      phone,
    })
  }
  return out
}

export function parseContactsFromJson(text: string): ParsedImportContact[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const flat: ParsedImportContact[] = []
  const pushObj = (item: unknown) => {
    if (!item || typeof item !== 'object') return
    const o = item as Record<string, unknown>
    const one = extractFromPlainObject(o)
    if (one) flat.push(one)
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item)) continue
      pushObj(item)
    }
    return flat
  }
  if (data && typeof data === 'object') {
    const root = data as Record<string, unknown>
    if (Array.isArray(root.contacts)) {
      for (const item of root.contacts) pushObj(item)
      return flat
    }
    if (Array.isArray(root.connections)) {
      for (const c of root.connections) flat.push(...parseGoogleConnection(c))
      return flat
    }
  }
  return flat
}

export function parseContactsFromHtml(html: string): ParsedImportContact[] {
  if (typeof document === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return []
  const rows = table.querySelectorAll('tr')
  if (rows.length < 2) return []
  const headerCells = rows[0].querySelectorAll('th,td')
  const headers: string[] = []
  headerCells.forEach((cell) => headers.push(cell.textContent?.trim() ?? ''))
  const emailIdx = pickEmailColumnIndex(headers)
  if (emailIdx < 0) return []
  const phoneIdx = pickPhoneColumnIndex(headers)
  const out: ParsedImportContact[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll('td,th')
    const vals: string[] = []
    cells.forEach((c) => vals.push(c.textContent?.trim() ?? ''))
    const emailRaw = vals[emailIdx] ?? ''
    if (!emailRaw || !isValidEmail(emailRaw)) continue
    const name = pickNameFromRow(headers, vals) || emailRaw
    const phone = phoneIdx >= 0 ? vals[phoneIdx]?.trim() : undefined
    out.push({ name, email: normEmail(emailRaw), phone: phone || undefined })
  }
  return out
}

export type DetectedImportFormat = 'csv' | 'json' | 'html' | 'unknown'

export function detectAndParseContacts(fileName: string, text: string): {
  format: DetectedImportFormat
  contacts: ParsedImportContact[]
} {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) {
    return { format: 'json', contacts: parseContactsFromJson(text) }
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { format: 'html', contacts: parseContactsFromHtml(text) }
  }
  if (lower.endsWith('.csv')) {
    return { format: 'csv', contacts: parseContactsFromCsv(text) }
  }
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = parseContactsFromJson(text)
    if (j.length > 0) return { format: 'json', contacts: j }
  }
  if (t.includes('<table')) {
    const h = parseContactsFromHtml(text)
    if (h.length > 0) return { format: 'html', contacts: h }
  }
  const c = parseContactsFromCsv(text)
  if (c.length > 0) return { format: 'csv', contacts: c }
  return { format: 'unknown', contacts: [] }
}
