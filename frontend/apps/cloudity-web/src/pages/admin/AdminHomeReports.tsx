import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Card } from '@cloudity/ui'
import { ReportDocument } from './ReportDocument'
import { loadReportCatalog, loadReportText, type DocsReport } from './reportReading'

export function AdminHomeReports({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState<DocsReport | null>(null)
  const [body, setBody] = useState<{ markdown: string | null; plain: string | null } | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)

  const catalog = useQuery({
    queryKey: ['admin', 'docs-reports'],
    queryFn: () => loadReportCatalog(accessToken),
    retry: false,
  })

  async function openReport(report: DocsReport) {
    const filename = report.filename || ''
    if (!filename || !catalog.data) return
    setOpen(report)
    setBody(null)
    setReadError(null)
    setReading(true)
    try {
      const loaded = await loadReportText(catalog.data.token, filename, catalog.data.names)
      setBody({ markdown: loaded.markdown, plain: loaded.plain })
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Lecture impossible')
    } finally {
      setReading(false)
    }
  }

  if (open) {
    return (
      <section className="mb-6" aria-label="Rapport ouvert">
        <button
          type="button"
          className="mb-3 text-base font-medium text-blue-800 underline dark:text-blue-300"
          onClick={() => {
            setOpen(null)
            setBody(null)
            setReadError(null)
          }}
        >
          Retour aux rapports
        </button>
        <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-50">{open.title || open.filename}</h2>
        {reading ? <p className="text-base text-slate-700 dark:text-slate-200">Ouverture du rapport…</p> : null}
        {readError ? <p className="text-base text-red-700 dark:text-red-300">{readError}</p> : null}
        {body ? <ReportDocument markdown={body.markdown} plain={body.plain} /> : null}
      </section>
    )
  }

  const reports = catalog.data?.recent ?? []
  return (
    <Card className="p-4 mb-6">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-700 dark:text-slate-200" aria-hidden />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Derniers rapports</h2>
      </div>
      {catalog.isLoading ? <p className="text-base text-slate-700 dark:text-slate-200">Chargement des rapports…</p> : null}
      {catalog.isError ? (
        <p className="text-base text-slate-700 dark:text-slate-200">
          Les rapports du cahier ne sont pas joignables depuis cette session.
        </p>
      ) : null}
      {!catalog.isLoading && !catalog.isError && reports.length === 0 ? (
        <p className="text-base text-slate-700 dark:text-slate-200">Pas encore de rapport.</p>
      ) : null}
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.filename || r.title}>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => void openReport(r)}
            >
              <span className="block text-base font-semibold text-slate-900 dark:text-slate-50">{r.title || r.filename}</span>
              <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">{r.filename}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
