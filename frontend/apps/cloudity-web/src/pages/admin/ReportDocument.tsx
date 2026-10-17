import React from 'react'
import { parseReportMarkdown } from './reportReading'

function Inline({ text }: { text: string }) {
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) nodes.push(text.slice(last, i))
    const t = m[0]
    if (t.startsWith('**')) {
      nodes.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    } else if (t.startsWith('`')) {
      nodes.push(
        <code key={k} className="rounded bg-slate-100 px-1 text-[0.95em] text-slate-900 dark:bg-slate-800 dark:text-slate-100">
          {t.slice(1, -1)}
        </code>,
      )
    } else if (t.startsWith('[')) {
      const label = t.slice(t.indexOf('[') + 1, t.indexOf(']'))
      nodes.push(
        <span key={k} className="font-semibold text-blue-800 dark:text-blue-300">
          {label}
        </span>,
      )
    } else {
      nodes.push(<em key={k}>{t.slice(1, -1)}</em>)
    }
    k += 1
    last = i + t.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

/** Corps du rapport : 17 px, encre sur papier, clair et sombre. */
export function ReportDocument({
  markdown,
  plain,
}: {
  markdown?: string | null
  plain?: string | null
}) {
  if (plain && !markdown) {
    return (
      <article
        data-testid="report-document"
        className="report-sheet w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white px-5 py-6 text-[17px] leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:px-8"
      >
        <pre className="whitespace-pre-wrap font-sans text-[17px] leading-relaxed text-slate-900 dark:text-slate-100">{plain}</pre>
      </article>
    )
  }
  const blocks = parseReportMarkdown(markdown || '')
  return (
    <article
      data-testid="report-document"
      className="report-sheet w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white px-5 py-6 text-[17px] leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:px-8"
    >
      {blocks.map((b, i) => {
        if (b.t === 'h') {
          const Tag = b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3'
          const cls =
            b.level === 1
              ? 'mb-3 mt-2 text-[26px] font-bold leading-tight text-slate-900 dark:text-slate-50'
              : b.level === 2
                ? 'mb-2 mt-6 text-[22px] font-semibold leading-snug text-slate-900 dark:text-slate-50'
                : 'mb-2 mt-5 text-[19px] font-semibold text-slate-900 dark:text-slate-50'
          return (
            <Tag key={i} className={cls}>
              {b.text}
            </Tag>
          )
        }
        if (b.t === 'li') {
          return (
            <p key={i} className="mb-2 break-words pl-1 text-[17px] leading-relaxed text-slate-900 dark:text-slate-100">
              <span aria-hidden="true">• </span>
              <Inline text={b.text} />
            </p>
          )
        }
        if (b.t === 'code') {
          return (
            <pre
              key={i}
              className="my-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-[15px] leading-relaxed text-slate-900 dark:bg-slate-800 dark:text-slate-100"
            >
              {b.text}
            </pre>
          )
        }
        if (b.t === 'quote') {
          return (
            <blockquote
              key={i}
              className="my-3 border-l-4 border-slate-700 bg-slate-100 px-3 py-2 text-[17px] italic text-slate-900 dark:border-slate-200 dark:bg-slate-800 dark:text-slate-100"
            >
              <Inline text={b.text} />
            </blockquote>
          )
        }
        if (b.t === 'hr') return <hr key={i} className="my-6 border-slate-200 dark:border-slate-700" />
        if (b.t === 'table') {
          return (
            <div key={i} className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-[16px] text-slate-900 dark:text-slate-100">
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'bg-slate-100 dark:bg-slate-800' : ''}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-slate-300 px-2 py-2 align-top dark:border-slate-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <p key={i} className="mb-3 break-words text-[17px] leading-relaxed text-slate-900 dark:text-slate-100">
            <Inline text={b.text} />
          </p>
        )
      })}
    </article>
  )
}
