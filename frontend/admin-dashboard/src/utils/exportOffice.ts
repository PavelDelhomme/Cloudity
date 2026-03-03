/**
 * Export du contenu éditeur vers des formats Office (.docx, .xlsx).
 * L'éditeur intégré travaille en .html / .csv ; ces fonctions permettent
 * de télécharger des fichiers « vrais » compatibles Word/Excel.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from 'docx'
import * as XLSX from 'xlsx'

type ParagraphOpt = { children: import('docx').TextRun[]; heading?: import('docx').HeadingLevel }

/** Convertit du HTML (éditeur riche) en blob .docx pour téléchargement. */
export async function htmlToDocxBlob(html: string): Promise<Blob> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || '<p></p>', 'text/html')
  const body = doc.body
  const children: ParagraphOpt[] = []

  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'HR']
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) children.push({ children: [new TextRun(text)] })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toUpperCase()

    if (tag === 'HR') {
      children.push({ children: [new TextRun('—'.repeat(30))] })
      return
    }

    if (blockTags.includes(tag)) {
      const runs = collectTextRuns(el)
      const opts: ParagraphOpt = { children: runs.length ? runs : [new TextRun('')] }
      if (tag === 'H1') opts.heading = HeadingLevel.HEADING_1
      else if (tag === 'H2') opts.heading = HeadingLevel.HEADING_2
      else if (tag === 'H3') opts.heading = HeadingLevel.HEADING_3
      else if (tag === 'H4') opts.heading = HeadingLevel.HEADING_4
      else if (tag === 'H5') opts.heading = HeadingLevel.HEADING_5
      else if (tag === 'H6') opts.heading = HeadingLevel.HEADING_6
      children.push(opts)
      return
    }

    for (const child of el.childNodes) walk(child)
  }

  function collectTextRuns(container: Element): TextRun[] {
    const runs: TextRun[] = []
    const walkInline = (n: Node, opts: { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean } = {}) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent?.trim()
        if (t) runs.push(new TextRun({ text: t, ...opts }))
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const e = n as Element
      const tag = e.tagName.toUpperCase()
      const next = { ...opts }
      if (tag === 'B' || tag === 'STRONG') next.bold = true
      else if (tag === 'I' || tag === 'EM') next.italics = true
      else if (tag === 'U') next.underline = true
      else if (tag === 'S' || tag === 'STRIKE') next.strike = true
      for (const c of e.childNodes) walkInline(c, next)
    }
    for (const c of container.childNodes) walkInline(c)
    return runs
  }

  if (body) {
    for (const node of body.childNodes) walk(node)
  }
  if (children.length === 0) {
    children.push({ children: [new TextRun('')] })
  }

  const document = new Document({
    sections: [{ children: children.map((c) => new Paragraph(c)) }],
  })
  return Packer.toBlob(document)
}

/** Télécharge le document courant en .docx. */
export function downloadDocx(blob: Blob, baseName: string): void {
  const name = baseName.replace(/\.(html?|htm)$/i, '') + '.docx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse CSV texte en tableau de lignes/colonnes et télécharge en .xlsx. */
export function csvToXlsxDownload(csvText: string, baseName: string): void {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0)
  const rows = lines.map((line) => {
    const row: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if ((ch === ',' || ch === ';') && !inQuotes) {
        row.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    row.push(cur.trim())
    return row
  })
  const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [['']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Feuille 1')
  const name = baseName.replace(/\.csv$/i, '') + '.xlsx'
  XLSX.writeFile(wb, name)
}

/** Blob .xlsx vide (une feuille, une cellule). */
export function emptyXlsxBlob(): Blob {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Feuille 1')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Grille (string[][]) vers blob .xlsx. */
export function gridToXlsxBlob(grid: string[][]): Blob {
  const rows = grid.length ? grid : [['']]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Feuille 1')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Blob .xlsx vers grille string[][]. */
export async function xlsxBlobToGrid(blob: Blob): Promise<string[][]> {
  const buf = await blob.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const first = wb.SheetNames[0]
  if (!first) return [['']]
  const ws = wb.Sheets[first]
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 })
  const grid = (aoa.length ? aoa : [['']]).map((row) => row.map((c) => String(c ?? '')))
  return grid
}
