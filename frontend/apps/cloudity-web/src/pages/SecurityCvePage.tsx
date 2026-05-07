import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchCveReport, refreshCveReport, type CveReportResponse } from '../api'
import { PageLayout, Card } from '@cloudity/shared'
import { AlertTriangle, ExternalLink, RefreshCw, Shield } from 'lucide-react'

function CveTable({ report }: { report: CveReportResponse }) {
  if (report.findings.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Aucune vulnérabilité connue dans OSV pour les versions déclarées analysées (ou analyse impossible — voir le message ci-dessus).
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2">Écosystème</th>
            <th className="px-3 py-2">Paquet</th>
            <th className="px-3 py-2">Version</th>
            <th className="px-3 py-2">CVE / OSV</th>
            <th className="px-3 py-2">Résumé</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
          {report.findings.map((f) =>
            f.vulns.map((v) => (
              <tr key={`${f.package}@${f.version}-${v.osv_id}`} className="bg-white dark:bg-slate-900/40">
                <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{f.ecosystem}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-800 dark:text-slate-100">{f.package}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{f.version}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(v.cve_aliases.length ? v.cve_aliases : [v.osv_id]).map((id) => (
                      <a
                        key={id}
                        href={
                          id.startsWith('CVE-')
                            ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`
                            : `https://osv.dev/vulnerability/${encodeURIComponent(id)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100 hover:underline"
                      >
                        {id}
                        <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                      </a>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-md">
                  {v.summary || '—'}
                  {v.modified ? (
                    <span className="block text-[10px] text-slate-400 mt-0.5">Modifié OSV : {v.modified}</span>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function SecurityCvePage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()

  const { data: report, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'cve-report'],
    queryFn: () => fetchCveReport(accessToken!, false),
    enabled: Boolean(accessToken),
    staleTime: 60 * 60 * 1000,
  })

  const refreshMut = useMutation({
    mutationFn: () => refreshCveReport(accessToken!),
    onSuccess: (r) => {
      queryClient.setQueryData(['admin', 'cve-report'], r)
    },
  })

  if (!accessToken) {
    return (
      <PageLayout title="CVE / dépendances">
        <p className="text-slate-500 dark:text-slate-400">Non authentifié.</p>
      </PageLayout>
    )
  }

  const busy = isLoading || isFetching || refreshMut.isPending

  return (
    <PageLayout
      title="Analyse CVE (dépendances)"
      description="Interrogation de la base OSV (alignée CVE) sur les go.mod, package-lock npm et requirements Python du dépôt monté côté admin-service."
    >
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          Recharger (cache serveur)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => refreshMut.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50"
        >
          <Shield className="h-4 w-4" aria-hidden />
          Nouveau scan OSV
        </button>
      </div>

      {error ? (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30">
          <p className="text-red-800 dark:text-red-200 text-sm">{error instanceof Error ? error.message : String(error)}</p>
        </Card>
      ) : null}

      {isLoading && !report ? (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Chargement du rapport…
        </div>
      ) : null}

      {report ? (
        <div className="space-y-6">
          {report.error ? (
            <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">Configuration du scan</p>
                  <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">{report.error}</p>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Paquets analysés</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{report.packages_scanned}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Paquets avec alertes</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{report.packages_with_vulns}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Entrées vuln.</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{report.vuln_entries_total}</p>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Dernier scan : <span className="font-mono text-xs">{report.scanned_at}</span>
                {report.from_cache ? (
                  <span className="ml-2 rounded bg-slate-200 dark:bg-slate-600 px-2 py-0.5 text-xs">cache DB</span>
                ) : (
                  <span className="ml-2 rounded bg-emerald-200 dark:bg-emerald-800 px-2 py-0.5 text-xs">live</span>
                )}
                {report.snapshot_id != null ? (
                  <span className="ml-2 text-xs text-slate-400">snapshot #{report.snapshot_id}</span>
                ) : null}
              </p>
              <a
                href="https://osv.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                À propos d’OSV
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
            <CveTable report={report} />
          </Card>

          {report.notes.length > 0 ? (
            <Card>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Notes</p>
              <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </PageLayout>
  )
}
