import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Card } from '@cloudity/ui'
import {
  getMailDesktopNotificationStatus,
  isMailDesktopNotificationsEnabled,
  requestMailDesktopNotifications,
  setMailDesktopNotificationsEnabled,
  type MailDesktopNotificationStatus,
} from '../../../lib/mailDesktopNotifications'

function statusLabel(status: MailDesktopNotificationStatus, enabled: boolean): string {
  if (status === 'unsupported') return 'Non supporté par ce navigateur'
  if (status === 'denied') return 'Bloqué par le navigateur'
  if (status === 'default') return 'Autorisation non demandée'
  return enabled ? 'Activé' : 'Autorisé, mais désactivé dans Cloudity'
}

export default function MailNotificationsSection() {
  const [status, setStatus] = useState<MailDesktopNotificationStatus>(() => getMailDesktopNotificationStatus())
  const [enabled, setEnabled] = useState(() => isMailDesktopNotificationsEnabled())

  const refresh = () => {
    setStatus(getMailDesktopNotificationStatus())
    setEnabled(isMailDesktopNotificationsEnabled())
  }

  useEffect(() => {
    refresh()
  }, [])

  const enable = async () => {
    const next = await requestMailDesktopNotifications()
    setStatus(next)
    setEnabled(isMailDesktopNotificationsEnabled())
    if (next === 'granted') toast.success('Notifications Mail activées sur cet ordinateur')
    else if (next === 'denied') toast.error('Notifications bloquées : autorisez-les dans les réglages du navigateur')
    else toast.error('Notifications non disponibles sur ce navigateur')
  }

  const disable = () => {
    setMailDesktopNotificationsEnabled(false)
    refresh()
    toast.success('Notifications Mail désactivées pour ce navigateur')
  }

  const test = () => {
    if (!isMailDesktopNotificationsEnabled()) {
      toast.error('Activez les notifications avant de tester')
      return
    }
    try {
      new Notification('Cloudity Mail', {
        body: 'Notification de test : nouveaux mails visibles ici.',
        tag: 'cloudity-mail-test',
      })
      toast.success('Notification de test envoyée')
    } catch {
      toast.error('Le navigateur a refusé la notification de test')
    }
  }

  return (
    <Card className="max-w-3xl">
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Notifications Mail</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Active les notifications système de ce navigateur quand Cloudity synchronise de nouveaux mails.
            Elles fonctionnent sur cet ordinateur uniquement.
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">État : </span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{statusLabel(status, enabled)}</span>
        </div>

        {status === 'denied' ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Le navigateur bloque les notifications. Ouvre les réglages du site Cloudity dans ton navigateur,
            autorise les notifications, puis recharge la page.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={enable} disabled={status === 'unsupported'}>
            Activer sur cet ordinateur
          </Button>
          <Button type="button" variant="secondary" onClick={test} disabled={!enabled}>
            Tester
          </Button>
          <Button type="button" variant="ghost" onClick={disable} disabled={!enabled}>
            Désactiver
          </Button>
        </div>
      </div>
    </Card>
  )
}
