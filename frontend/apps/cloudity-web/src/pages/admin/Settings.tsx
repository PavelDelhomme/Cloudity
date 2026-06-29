import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { Card, PageLayout } from '@cloudity/ui'
import { adminUiPath } from '@cloudity/shared'

export default function Settings() {
  const { email } = useAuth()

  return (
    <PageLayout
      title="Paramètres administration"
      description="Préférences du back-office et raccourcis opérationnels — pas votre compte personnel."
    >
      <Card className="p-4 mb-4 border-brand-200 dark:border-brand-800/40 bg-brand-50/40 dark:bg-brand-950/20">
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          Session connectée : <span className="font-medium">{email ?? '—'}</span>. Passkeys, 2FA et préférences
          personnelles se gèrent dans{' '}
          <Link to="/app/settings" className="text-brand-600 dark:text-brand-400 font-medium hover:underline">
            Paramètres app (/app/settings)
          </Link>
          , pas ici — même logique que Google (console admin ≠ compte Google).
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exploitation</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            CVE, snapshots runtime, pipelines CI et distribution mobile.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath()}>
              Tableau de bord
            </Link>
            <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('securite-cve')}>
              Rapport CVE
            </Link>
            <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('mobile-distribution')}>
              Mobile / OTA
            </Link>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Utilisateurs & sécurité</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Gestion des comptes tenant, reset 2FA admin, domaines mail.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('users')}>
              Utilisateurs
            </Link>
            <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('domaines')}>
              Domaines mail
            </Link>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Design system</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Catalogue UI @cloudity/ui — toggles de personnalisation globale à venir (feature flags par composant).
          </p>
          <Link className="mt-3 inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to={adminUiPath('dev/ui')}>
            Ouvrir le catalogue UI
          </Link>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pass (coffres personnels)</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Les coffres E2EE sont liés à votre user_id, pas au rôle admin. Gérez-les dans l’app Pass.
          </p>
          <Link className="mt-3 inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" to="/app/pass">
            Ouvrir Pass
          </Link>
        </Card>
      </div>

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Les préférences globales admin (thème back-office, notifications ops) ne sont pas encore persistées.
      </p>
    </PageLayout>
  )
}
