import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../authContext'
import { fetchCveReport, refreshCveReport, type CveReportResponse } from '../../api'
import { Badge, Card, PageLayout } from '@cloudity/ui'
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Shield } from 'lucide-react'

function formatScanDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}

function vulnIds(v: { aliases?: string[] | null; cve_aliases?: string[] | null; osv_id: string }): string[] {
  if (v.aliases?.length) return [...new Set([v.osv_id, ...v.aliases])]
  if (v.cve_aliases?.length) return [...new Set([v.osv_id, ...v.cve_aliases])]
  return [v.osv_id]
}

function vulnUrl(id: string): string {
  if (id.startsWith('CVE-')) return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`
  if (id.startsWith('GHSA-')) return `https://github.com/advisories/${encodeURIComponent(id)}`
  return `https://osv.dev/vulnerability/${encodeURIComponent(id)}`
}

function shortenDetails(details?: string | null): string | null {
  if (!details) return null
  const compact = details.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  return compact.length > 260 ? `${compact.slice(0, 257)}…` : compact
}

function CveTable({ report }: { report: CveReportResponse }) {
  if (report.findings.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/20 p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
          <div>
            <p className="font-semibold text-emerald-950 dark:text-emerald-100">Scan OSV terminé : aucune alerte connue.</p>
            <p className="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">
              Les versions déclarées dans les manifests analysés ne correspondent à aucune vulnérabilité OSV connue au moment du scan.
            </p>
          </div>
        </div>
      </div>
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
            <th className="px-3 py-2">Impact / correction</th>
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
                    {vulnIds(v).map((id) => (
                      <a
                        key={id}
                        href={
                          vulnUrl(id)
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
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-xl">
                  <div className="space-y-1.5">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {v.summary || shortenDetails(v.details) || 'Résumé OSV indisponible'}
                    </p>
                    {v.severity ? (
                      <p className="text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Sévérité :</span> {v.severity}
                      </p>
                    ) : null}
                    {v.fixed_versions?.length ? (
                      <p className="text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Corrigé en :</span>{' '}
                        <span className="font-mono">{v.fixed_versions.join(', ')}</span>
                      </p>
                    ) : null}
                    {v.affected_ranges?.length ? (
                      <p className="text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Plage affectée :</span>{' '}
                        <span className="font-mono">{v.affected_ranges.slice(0, 2).join(' ; ')}</span>
                      </p>
                    ) : null}
                  </div>
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
  const packagePriorities = report
    ? [...report.findings]
        .sort((a, b) => b.vulns.length - a.vulns.length)
        .slice(0, 6)
    : []
  const ecosystems = report
    ? [...new Set(report.findings.map((f) => f.ecosystem))]
        .sort()
        .map((ecosystem) => ({
          ecosystem,
          packages: report.findings.filter((f) => f.ecosystem === ecosystem).length,
          vulns: report.findings
            .filter((f) => f.ecosystem === ecosystem)
            .reduce((sum, f) => sum + f.vulns.length, 0),
        }))
    : []
  const manifestRows = report?.manifests
    ? [
        { label: 'go.mod', value: report.manifests.go_mod ?? 0 },
        { label: 'package-lock.json', value: report.manifests.package_lock ?? 0 },
        { label: 'requirements*.txt', value: report.manifests.requirements ?? 0 },
      ]
    : []
  const packageCoverage = report?.ecosystem_package_counts
    ? Object.entries(report.ecosystem_package_counts).sort(([a], [b]) => a.localeCompare(b))
    : []

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

          {packagePriorities.length > 0 ? (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-950 dark:text-amber-100">Priorités de mise à jour</p>
                  <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
                    OSV signale des versions vulnérables. La prochaine étape utile est de monter ces dépendances et relancer les tests,
                    pas seulement conserver la liste brute.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {packagePriorities.map((f) => (
                      <span
                        key={`${f.ecosystem}-${f.package}-${f.version}`}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 dark:border-amber-700 bg-white/70 dark:bg-amber-950/40 px-2.5 py-1 text-xs text-amber-950 dark:text-amber-100"
                      >
                        <span className="font-mono">{f.package}</span>
                        <Badge variant="warning">{f.vulns.length}</Badge>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {ecosystems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ecosystems.map((row) => (
                <Card key={row.ecosystem} className="p-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{row.ecosystem}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    {row.packages} paquet(s), {row.vulns} entrée(s)
                  </p>
                </Card>
              ))}
            </div>
          ) : null}

          {report.findings.length === 0 && (manifestRows.length > 0 || packageCoverage.length > 0) ? (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Couverture du scan</p>
              {manifestRows.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {manifestRows.map((row) => (
                    <div key={row.label} className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3">
                      <p className="text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">{row.label}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{row.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {packageCoverage.length > 0 ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  Paquets analysés :{' '}
                  {packageCoverage.map(([ecosystem, count]) => `${ecosystem}=${count}`).join(', ')}.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Dernier scan : <span className="font-mono text-xs">{formatScanDate(report.scanned_at)}</span>
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
