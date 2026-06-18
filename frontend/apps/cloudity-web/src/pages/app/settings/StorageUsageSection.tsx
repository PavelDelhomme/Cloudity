import React, { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@cloudity/ui'
import { useAuth } from '../../../authContext'
import { fetchDriveStorageSummary, type DriveStorageSummary } from '../../../api'

function formatStorageBytes(bytes: number): string {
  if (bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

export default function StorageUsageSection() {
  const { accessToken } = useAuth()
  const [usage, setUsage] = useState<DriveStorageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const summary = await fetchDriveStorageSummary(accessToken)
      setUsage(summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger le quota')
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Espace utilisé
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Répartition Photos et Drive (hors dossier Photos).
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            Actualiser
          </Button>
        </div>

        {loading && !usage ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Calcul en cours…</p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : usage ? (
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-300">{usage.photos.label}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">
                {formatStorageBytes(usage.photos.bytes)}
                <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                  {usage.photos.file_count} fichier(s)
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-300">{usage.drive.label}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">
                {formatStorageBytes(usage.drive.bytes)}
                <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                  {usage.drive.file_count} fichier(s)
                </span>
              </dd>
            </div>
            {usage.note ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">{usage.note}</p>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Indisponible</p>
        )}
      </div>
    </Card>
  )
}
