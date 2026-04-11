import React from 'react'
import { useAuth } from '../../authContext'
import { Card } from '../../components/PageLayout'

export default function AppSettingsPage() {
  const { email, tenantId } = useAuth()

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-500">Votre compte et préférences.</p>
      </div>
      <Card className="max-w-xl">
        <div className="p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Session</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Organisation (tenant)</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{tenantId ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-5 text-slate-500 text-sm">
            Changer le mot de passe et autres options seront disponibles prochainement.
          </p>
        </div>
      </Card>
    </div>
  )
}
