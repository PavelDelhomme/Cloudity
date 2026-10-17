import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ReportDocument } from './ReportDocument'

describe('ReportDocument', () => {
  it('affiche le corps en 17 px, lisible en sombre', () => {
    document.documentElement.classList.add('dark')
    render(
      <ReportDocument
        markdown={'# 16 oct 2026 — lot de nuit\n\nLes 3 boîtes sont sur l’API pour le compte propriétaire.\n'}
      />,
    )
    const article = screen.getByTestId('report-document')
    expect(article.className).toContain('text-[17px]')
    expect(article.className).toContain('dark:text-slate-100')
    expect(article.className).toContain('bg-white')
    expect(article.className).toContain('dark:bg-slate-950')
    expect(screen.getByRole('heading', { name: /lot de nuit/ })).toBeTruthy()
    expect(screen.getByText(/compte propriétaire/)).toBeTruthy()
    const heading = screen.getByRole('heading', { name: /lot de nuit/ })
    expect(heading.className).toContain('text-[26px]')
    expect(heading.className).toContain('dark:text-slate-50')
  })
})