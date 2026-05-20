import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { Card, PageLayout } from '@cloudity/ui'
import { adminUiPath } from '@cloudity/shared'

export default function Settings() {
  const { email, tenantId } = useAuth()

  return (
    <PageLayout
      title="Paramètres"
      description="Session et préférences"
    >
      <Card className="max-w-xl">
        <div className="p-6">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Session</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Tenant ID</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{tenantId ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-5 text-slate-500 dark:text-slate-400 text-sm">
            Les préférences globales admin ne sont pas encore persistées ; les raccourcis ci-dessous pointent vers les écrans
            opérationnels déjà disponibles.
          </p>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sécurité</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Passkeys, 2FA et codes de récupération restent séparés des préférences visuelles pour garder un parcours auditable.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('passkeys')}>
              Gérer mes passkeys
            </Link>
            <Link className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('users')}>
              Voir 2FA utilisateurs
            </Link>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exploitation</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            CVE, snapshots runtime et pipelines sont suivis dans le dashboard et les pages dédiées.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath()}>
              Tableau de bord
            </Link>
            <Link className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('securite-cve')}>
              Rapport CVE
            </Link>
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}
