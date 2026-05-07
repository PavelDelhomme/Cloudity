/**
 * Conversion HTML ↔ Markdown pour l'éditeur de documents (mode Markdown).
 */

import TurndownService from 'turndown'
import { marked } from 'marked'

let turndown: TurndownService | null = null

function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    turndown.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => `~~${content}~~`,
    })
  }
  return turndown
}

/** Convertit du HTML en Markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return ''
  try {
    return getTurndown().turndown(html)
  } catch {
    return html
  }
}

/** Convertit du Markdown en HTML. */
export function markdownToHtml(md: string): string {
  if (!md?.trim()) return '<p></p>'
  try {
    const out = marked.parse(md) as string
    return out || '<p></p>'
  } catch {
    return `<p>${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
  }
}
