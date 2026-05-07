import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import {
  fetchBudgetStatus,
  fetchDashboardStats,
  fetchPerformanceHistory,
  fetchPerformanceOverview,
  fetchPipelineRuns,
  recordPerformanceSnapshot,
} from '../api'
import { PageLayout, Card, adminUiPath } from '@cloudity/shared'

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export default function Dashboard() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => fetchDashboardStats(accessToken!),
    enabled: Boolean(accessToken),
  })
  const { data: perf } = useQuery({
    queryKey: ['dashboard-performance-overview'],
    queryFn: () => fetchPerformanceOverview(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 15_000,
  })
  const { data: perfHistory } = useQuery({
    queryKey: ['dashboard-performance-history'],
    queryFn: () => fetchPerformanceHistory(accessToken!, 12),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000,
  })
  const { data: pipelineRuns } = useQuery({
    queryKey: ['dashboard-pipeline-runs'],
    queryFn: () => fetchPipelineRuns(accessToken!, 20),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000,
  })
  const { data: budgetStatus } = useQuery({
    queryKey: ['dashboard-budget-status'],
    queryFn: () => fetchBudgetStatus(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000,
  })

  const recordSnapshot = useMutation({
    mutationFn: () => recordPerformanceSnapshot(accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-performance-history'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-budget-status'] })
    },
  })

  if (!accessToken) {
    return (
      <PageLayout title="Tableau de bord">
        <p className="text-slate-500 dark:text-slate-400">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Tableau de bord">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement des statistiques…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Tableau de bord">
        <p className="text-red-600 dark:text-red-400">{error instanceof Error ? error.message : 'Erreur'}</p>
      </PageLayout>
    )
  }

  const s = stats ?? { active_tenants: 0, total_users: 0, api_calls_today: 0 }

  const cards = [
    {
      label: 'Tenants actifs',
      value: formatNumber(s.active_tenants),
      icon: Building2,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
    },
    {
      label: 'Utilisateurs total',
      value: formatNumber(s.total_users),
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Appels API aujourd’hui',
      value: formatNumber(s.api_calls_today),
      icon: Activity,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
  ]

  return (
    <PageLayout
      title="Tableau de bord"
      description="Vue d’ensemble de votre instance Cloudity"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{c.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100" data-testid={c.label === 'Tenants actifs' ? 'stat-active-tenants' : c.label === 'Utilisateurs total' ? 'stat-total-users' : 'stat-api-calls'}>
                    {c.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${c.bg} ${c.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-4 mt-6 border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Shield className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Vulnérabilités des dépendances (CVE / OSV)</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Analyse automatique des go.mod, npm et requirements via l’API publique OSV (alignée NVD/CVE).
              </p>
            </div>
          </div>
          <Link
            to={adminUiPath('securite-cve')}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
          >
            Ouvrir le rapport CVE
          </Link>
        </div>
      </Card>

      {budgetStatus?.violations?.length ? (
        <Card className="p-6 mt-6 border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-red-900 dark:text-red-100">Budgets performance dépassés</h3>
              <p className="text-xs text-red-800 dark:text-red-200/90 mt-1">
                Source évaluation : {budgetStatus.source_snapshot} —{' '}
                {new Date(budgetStatus.evaluated_at).toLocaleString('fr-FR')}
              </p>
              <ul className="mt-2 text-sm text-red-900 dark:text-red-100 list-disc list-inside space-y-1">
                {budgetStatus.violations.map((v) => (
                  <li key={`${v.key}-${String(v.observed)}`}>{v.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-6 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance runtime (snapshot)</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => recordSnapshot.mutate()}
              disabled={recordSnapshot.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5" />
              {recordSnapshot.isPending ? 'Enregistrement…' : 'Enregistrer un snapshot'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {perf?.timestamp_utc ? new Date(perf.timestamp_utc).toLocaleString('fr-FR') : '—'}
            </span>
          </div>
        </div>
        {recordSnapshot.isError ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
            {(recordSnapshot.error as Error)?.message ?? 'Impossible d’enregistrer (migration DB ou droits).'}
          </p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-slate-500 dark:text-slate-400">Load avg (1m)</p>
            <p className="text-slate-900 dark:text-slate-100 font-semibold">{perf?.host?.loadavg_1m?.toFixed?.(2) ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-slate-500 dark:text-slate-400">Mémoire cgroup</p>
            <p className="text-slate-900 dark:text-slate-100 font-semibold">
              {perf?.host?.cgroup_memory_current_bytes != null ? `${(perf.host.cgroup_memory_current_bytes / (1024 * 1024)).toFixed(1)} MiB` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-slate-500 dark:text-slate-400">IO lecture cgroup</p>
            <p className="text-slate-900 dark:text-slate-100 font-semibold">
              {perf?.host?.cgroup_io_read_bytes != null ? `${(perf.host.cgroup_io_read_bytes / (1024 * 1024)).toFixed(1)} MiB` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-slate-500 dark:text-slate-400">IO écriture cgroup</p>
            <p className="text-slate-900 dark:text-slate-100 font-semibold">
              {perf?.host?.cgroup_io_write_bytes != null ? `${(perf.host.cgroup_io_write_bytes / (1024 * 1024)).toFixed(1)} MiB` : '—'}
            </p>
          </div>
        </div>
        {perf?.notes?.length ? (
          <div className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {perf.notes.map((n, i) => <p key={`perf-note-${i}`}>• {n}</p>)}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Historique snapshots</h3>
          </div>
          {!perfHistory?.storage_ready ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Stockage historique indisponible (exécuter la migration 33 puis redémarrer admin-service).
            </p>
          ) : perfHistory.items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucun snapshot enregistré pour l’instant.</p>
          ) : (
            <>
              <ul className="text-sm space-y-2">
                {perfHistory.items.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0"
                  >
                    <span className="text-slate-700 dark:text-slate-200 truncate">
                      #{row.id} · {row.source}
                      {row.containers_count === 0 ? (
                        <span className="text-slate-500 dark:text-slate-400 font-normal"> · cgroup</span>
                      ) : null}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs sm:text-right whitespace-nowrap">
                      {new Date(row.recorded_at).toLocaleString('fr-FR')} · {row.containers_count} ctr.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <strong className="text-slate-600 dark:text-slate-300">0 conteneur</strong> est attendu tant que le
                service admin n’a pas accès au démon Docker (socket monté) : seules les métriques{' '}
                <strong>cgroup</strong> du conteneur sont enregistrées, pas la liste <code className="text-[11px]">docker stats</code>.
              </p>
            </>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Runs pipelines (tests / E2E / mobile)</h3>
          {!pipelineRuns?.storage_ready ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Même stockage que l’historique — migration 33 requise pour persister les rapports CI.
            </p>
          ) : pipelineRuns.items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucun run ingéré. Utiliser{' '}
              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">scripts/ci/report-pipeline-run.sh</code>{' '}
              depuis la CI ou après <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">make test</code>.
            </p>
          ) : (
            <ul className="text-sm space-y-2 divide-y divide-slate-100 dark:divide-slate-700">
              {pipelineRuns.items.map((run) => (
                <li key={run.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center pt-2 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate" title={run.pipeline_kind}>
                      {run.pipeline_kind}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {new Date(run.recorded_at).toLocaleString('fr-FR')}
                      {run.duration_ms != null ? ` · ${run.duration_ms} ms` : ''}
                      {run.run_id ? ` · ${run.run_id}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${
                      run.success === false
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-200'
                        : run.success === true
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {run.success === true ? 'OK' : run.success === false ? 'Échec' : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {budgetStatus && Object.keys(budgetStatus.budgets).length > 0 && !budgetStatus.violations?.length ? (
        <Card className="p-4 mt-6 border-emerald-200 dark:border-emerald-900/50">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Budgets actifs : respectés (source {budgetStatus.source_snapshot}).
          </p>
        </Card>
      ) : null}
    </PageLayout>
  )
}
