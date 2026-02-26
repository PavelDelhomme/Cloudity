import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { fetchDashboardStats } from '../api'
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

  if (!accessToken) {
    return (
      <PageLayout title="Tableau de bord">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Tableau de bord">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Chargement des statistiques…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Tableau de bord">
        <p className="text-red-600">{error instanceof Error ? error.message : 'Erreur'}</p>
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
                  <p className="text-sm font-medium text-slate-500">{c.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900" data-testid={c.label === 'Tenants actifs' ? 'stat-active-tenants' : c.label === 'Utilisateurs total' ? 'stat-total-users' : 'stat-api-calls'}>
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
    </PageLayout>
  )
}
