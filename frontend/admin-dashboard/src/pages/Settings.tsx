import React from 'react'
import { useAuth } from '../authContext'
import { PageLayout, Card } from '../components/PageLayout'

export default function Settings() {
  const { email, tenantId } = useAuth()

  return (
    <PageLayout
      title="Paramètres"
      description="Session et préférences"
    >
      <Card className="max-w-xl">
        <div className="p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Session</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tenant ID</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{tenantId ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-5 text-slate-500 text-sm">
            Les paramètres avancés (thème, notifications, etc.) seront disponibles dans une prochaine version.
          </p>
        </div>
      </Card>
    </PageLayout>
  )
}
