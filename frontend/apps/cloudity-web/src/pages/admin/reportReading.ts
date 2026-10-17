/** Même règle que l’app Admin : le PDF de nuit ouvre la note markdown du cahier. */
export function companionNoteName(filename: string, names: string[]): string | null {
  const clean = filename.trim()
  if (!clean) return null
  if (clean.toLowerCase().endsWith('.md')) return clean

  const list = names.map((n) => n.trim()).filter(Boolean)
  const stem = clean.replace(/\.(pdf|html)$/i, '')
  const bare = stem.replace(/^Hubera-/i, '')
  const exact = new Set([`${stem}.md`.toLowerCase(), `${bare}.md`.toLowerCase()])
  for (const n of list) {
    if (exact.has(n.toLowerCase())) return n
  }

  const token = stem.match(/(\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)*)/i)?.[1]?.toLowerCase()
  if (!token || token.length < 10) return null
  let probe = token
  while (probe.length >= 10) {
    for (const n of list) {
      const low = n.toLowerCase()
      if (low.endsWith('.md') && low.includes(probe)) return n
    }
    const cut = probe.lastIndexOf('-')
    if (cut < 10) break
    probe = probe.substring(0, cut)
  }
  return null
}

export type ReportBlock =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string }
  | { t: 'code'; text: string }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'table'; rows: string[][] }

function cells(line: string): string[] {
  const raw = line.trim()
  const body = raw.startsWith('|') ? raw.slice(1) : raw
  const cut = body.endsWith('|') ? body.slice(0, -1) : body
  return cut.split('|').map((c) => c.trim())
}

function isSep(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim())
}

export function parseReportMarkdown(source: string): ReportBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: ReportBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      out.push({ t: 'code', text: buf.join('\n') })
      continue
    }
    if (/^---+$/.test(line.trim())) {
      out.push({ t: 'hr' })
      i += 1
      continue
    }
    if (line.startsWith('### ')) {
      out.push({ t: 'h', level: 3, text: line.slice(4).trim() })
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      out.push({ t: 'h', level: 2, text: line.slice(3).trim() })
      i += 1
      continue
    }
    if (line.startsWith('# ')) {
      out.push({ t: 'h', level: 1, text: line.slice(2).trim() })
      i += 1
      continue
    }
    if (line.startsWith('> ')) {
      out.push({ t: 'quote', text: line.slice(2).trim() })
      i += 1
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      out.push({ t: 'li', text: bullet[1] })
      i += 1
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const rows = [cells(line)]
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]))
        i += 1
      }
      out.push({ t: 'table', rows })
      continue
    }
    out.push({ t: 'p', text: line })
    i += 1
  }
  return out
}

export function htmlReportToPlain(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' · ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type DocsReport = {
  title?: string
  filename?: string
  summary?: string
  kind?: string
  sent_at?: string
}

const DOCS = '/docs-cahier/api'

export async function openDocsSession(accessToken: string): Promise<string> {
  const r = await fetch(`${DOCS}/auth/login/sso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  })
  if (!r.ok) throw new Error(`Cahier indisponible (${r.status})`)
  const j = (await r.json()) as { token?: string }
  if (!j.token) throw new Error('Cahier refusé')
  return j.token
}

async function docsJson<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${DOCS}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`Cahier ${r.status}`)
  return (await r.json()) as T
}

export async function loadReportCatalog(accessToken: string): Promise<{
  recent: DocsReport[]
  names: string[]
  token: string
}> {
  const token = await openDocsSession(accessToken)
  const [dash, all] = await Promise.all([
    docsJson<{ recentReports?: DocsReport[] }>(token, '/dashboard'),
    docsJson<{ reports?: DocsReport[]; files?: { filename?: string }[] }>(token, '/reports'),
  ])
  const recent = dash.recentReports ?? []
  const names = new Set<string>()
  for (const r of all.reports ?? []) if (r.filename) names.add(r.filename)
  for (const f of all.files ?? []) if (f.filename) names.add(f.filename)
  for (const r of recent) if (r.filename) names.add(r.filename)
  return { recent, names: [...names], token }
}

export async function loadReportText(
  token: string,
  filename: string,
  names: string[],
): Promise<{ titleFile: string; markdown: string | null; plain: string | null }> {
  const note = companionNoteName(filename, names)
  const file = note || filename
  const r = await fetch(`${DOCS}/reports/file/${encodeURIComponent(file)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`Fichier illisible (${r.status})`)
  const buf = new Uint8Array(await r.arrayBuffer())
  const lower = file.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return { titleFile: file, markdown: new TextDecoder('utf-8').decode(buf), plain: null }
  }
  if (lower.endsWith('.html')) {
    return { titleFile: file, markdown: htmlReportToPlain(new TextDecoder('utf-8').decode(buf)), plain: null }
  }
  const plain = await pdfBytesToText(buf)
  return { titleFile: file, markdown: null, plain }
}

export async function pdfBytesToText(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const task = pdfjs.getDocument({ data, isEvalSupported: false })
  const pdf = await task.promise
  const parts: string[] = []
  try {
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      let lineY = Number.NaN
      let line: string[] = []
      const flush = () => {
        const t = line.join(' ').replace(/\s+/g, ' ').trim()
        if (t) parts.push(t)
        line = []
      }
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue
        const y = item.transform[5] ?? 0
        if (line.length && Number.isFinite(lineY) && Math.abs(y - lineY) > 6) flush()
        lineY = y
        line.push(item.str)
      }
      flush()
      parts.push('')
    }
  } finally {
    await pdf.destroy()
  }
  const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text || 'Ce PDF ne contient pas de texte sélectionnable.'
}
