import React from 'react'
import { Card, ResponsivePage } from '@cloudity/ui'
import { useAuth } from '../../../authContext'
import PasskeysSection from './PasskeysSection'
import TwoFactorSection from './TwoFactorSection'
import RecoveryCodesSection from './RecoveryCodesSection'
import MailNotificationsSection from './MailNotificationsSection'
import StorageUsageSection from './StorageUsageSection'
import PassAutoLockSection from './PassAutoLockSection'

export default function AppSettingsPage() {
  const { email, tenantId } = useAuth()

  return (
    <ResponsivePage
      title="Paramètres"
      description="Votre compte, sécurité et préférences."
      className="max-w-3xl"
    >
      <Card>
        <div className="p-6">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Session</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Organisation (tenant)</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{tenantId ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Stockage</h2>
        <StorageUsageSection />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Notifications</h2>
        <MailNotificationsSection />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Sécurité — Pass</h2>
        <PassAutoLockSection />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Sécurité — Passkeys</h2>
        <PasskeysSection />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Sécurité — 2FA</h2>
        <TwoFactorSection />
        <div className="mt-4">
          <RecoveryCodesSection />
        </div>
      </section>
    </ResponsivePage>
  )
}
