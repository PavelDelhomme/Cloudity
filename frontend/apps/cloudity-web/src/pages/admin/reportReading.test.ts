import { describe, expect, it } from 'vitest'
import { companionNoteName, parseReportMarkdown } from './reportReading'

describe('companionNoteName', () => {
  it('relie le PDF de nuit à la note', () => {
    expect(
      companionNoteName('Hubera-2026-10-16-nuit.pdf', [
        'Hubera-2026-10-16-nuit.pdf',
        '2026-10-16-nuit.md',
      ]),
    ).toBe('2026-10-16-nuit.md')
  })
})

describe('parseReportMarkdown', () => {
  it('garde le titre, un paragraphe et le tableau', () => {
    const blocks = parseReportMarkdown(`# Nuit\n\nMail 1.0.23 sur le compte propriétaire.\n\n| App | Version |\n|-----|---------|\n| Admin | 0.1.8 |\n`)
    expect(blocks[0]).toMatchObject({ t: 'h', text: 'Nuit' })
    expect(blocks.some((b) => b.t === 'p' && b.text.includes('Mail 1.0.23'))).toBe(true)
    const table = blocks.find((b) => b.t === 'table')
    expect(table && table.t === 'table' ? table.rows[1][0] : '').toBe('Admin')
  })
})
