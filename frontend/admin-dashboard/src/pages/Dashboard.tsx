import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchDashboardStats, fetchPerformanceOverview } from '../api'
import { PageLayout, Card } from '../components/PageLayout'
import { Users, Building2, Activity } from 'lucide-react'

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export default function Dashboard() {
  const { accessToken } = useAuth()

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
      <Card className="p-6 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance runtime (snapshot)</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {perf?.timestamp_utc ? new Date(perf.timestamp_utc).toLocaleString('fr-FR') : '—'}
          </span>
        </div>
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
    </PageLayout>
  )
}
